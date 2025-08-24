// Supplier Pricing Management System
let currentUploadId = null;
let currentSupplierId = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
    await loadSuppliers();
    await loadRecentUploads();
    setupEventListeners();
});

// Load suppliers from database
async function loadSuppliers() {
    try {
        const { data: suppliers, error } = await supabase
            .from('suppliers')
            .select('*')
            .order('name');
        
        if (error) throw error;
        
        const select = document.getElementById('supplierSelect');
        select.innerHTML = '<option value="">-- Select Supplier --</option>';
        
        suppliers.forEach(supplier => {
            const option = document.createElement('option');
            option.value = supplier.id;
            option.textContent = supplier.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading suppliers:', error);
    }
}

// Load recent uploads
async function loadRecentUploads() {
    try {
        const { data: uploads, error } = await supabase
            .from('supplier_uploads')
            .select(`
                *,
                suppliers (name)
            `)
            .order('created_at', { ascending: false })
            .limit(20);
        
        if (error) throw error;
        
        const tbody = document.getElementById('uploadsTable');
        tbody.innerHTML = '';
        
        uploads.forEach(upload => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm">${new Date(upload.created_at).toLocaleDateString()}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">${upload.suppliers?.name || 'Unknown'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">${upload.file_name}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${upload.status === 'approved' ? 'bg-green-100 text-green-800' : 
                          upload.status === 'error' ? 'bg-red-100 text-red-800' : 
                          'bg-yellow-100 text-yellow-800'}">
                        ${upload.status}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <button onclick="handleUploadAction('${upload.id}', '${upload.status}', '${upload.supplier_id}')" 
                            class="text-blue-600 hover:text-blue-900">
                        ${upload.status === 'parsed' ? 'Map Headers' : 
                          upload.status === 'mapped' ? 'Normalize' : 
                          upload.status === 'normalized' ? 'Preview Matrix' :
                          upload.status === 'matrix_ready' ? 'Approve' : 'View'}
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading uploads:', error);
    }
}

// Setup event listeners
function setupEventListeners() {
    // Upload button
    document.getElementById('uploadBtn').addEventListener('click', handleUpload);
    
    // Mapping buttons
    document.getElementById('saveMappingBtn').addEventListener('click', saveMappingProfile);
    document.getElementById('cancelMappingBtn').addEventListener('click', () => {
        document.getElementById('mappingEditor').classList.add('hidden');
    });
    
    // Preview matrix button
    document.getElementById('previewMatrixBtn').addEventListener('click', previewPricingMatrix);
    
    // Approve/Reject buttons
    document.getElementById('approveBtn').addEventListener('click', approveRateCard);
    document.getElementById('rejectBtn').addEventListener('click', rejectUpload);
    
    // Family select change
    document.getElementById('familySelect').addEventListener('change', loadProductConfigs);
}

// Handle file upload
async function handleUpload() {
    const supplierId = document.getElementById('supplierSelect').value;
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    
    if (!supplierId || !file) {
        alert('Please select a supplier and file');
        return;
    }
    
    const uploadBtn = document.getElementById('uploadBtn');
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';
    
    try {
        // Upload file to storage
        const key = `${supplierId}/${Date.now()}-${file.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('supplier-quotes')
            .upload(key, file, {
                upsert: true,
                contentType: file.type
            });
        
        if (uploadError) throw uploadError;
        
        // Register upload in database
        const { data: registerData, error: registerError } = await supabase.rpc('inbox_register_upload', {
            p_supplier_id: supplierId,
            p_file_path: `supplier-quotes/${key}`,
            p_file_name: file.name,
            p_mime: file.type
        });
        
        if (registerError) throw registerError;
        
        currentUploadId = registerData;
        
        // Process the file
        await processUploadedFile(currentUploadId);
        
        // Show success message
        document.getElementById('uploadStatus').classList.remove('hidden');
        document.getElementById('uploadId').textContent = currentUploadId;
        
        // Reload uploads table
        await loadRecentUploads();
        
        // Reset form
        fileInput.value = '';
        document.getElementById('supplierSelect').value = '';
        
    } catch (error) {
        console.error('Upload error:', error);
        alert('Upload failed: ' + error.message);
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Upload & Parse';
    }
}

// Process uploaded file (parse CSV/XLSX)
async function processUploadedFile(uploadId) {
    try {
        // Get upload details
        const { data: upload, error } = await supabase
            .from('supplier_uploads')
            .select('*')
            .eq('id', uploadId)
            .single();
        
        if (error) throw error;
        
        // Download and parse file
        const key = upload.file_path.replace(/^supplier-quotes\//, '');
        const { data: fileData, error: downloadError } = await supabase.storage
            .from('supplier-quotes')
            .download(key);
        
        if (downloadError) throw downloadError;
        
        let rows = [];
        const fileName = upload.file_name.toLowerCase();
        
        if (fileName.endsWith('.csv')) {
            rows = await parseCSV(fileData);
        } else if (fileName.endsWith('.xlsx')) {
            rows = await parseExcel(fileData);
        } else if (fileName.endsWith('.pdf')) {
            // For PDFs, store as text for now
            const text = await fileData.text();
            rows = [{ row_index: 0, raw: { text } }];
        }
        
        // Store parsed rows
        if (rows.length > 0) {
            const payload = rows.map(r => ({
                upload_id: uploadId,
                row_index: r.row_index,
                raw: r.raw
            }));
            
            const { error: insertError } = await supabase
                .from('supplier_quote_raw_rows')
                .upsert(payload);
            
            if (insertError) throw insertError;
        }
        
        // Update status
        await supabase
            .from('supplier_uploads')
            .update({ 
                status: 'parsed',
                detected_format: fileName.endsWith('.xlsx') ? 'xlsx' : 
                                fileName.endsWith('.csv') ? 'csv' : 
                                fileName.endsWith('.pdf') ? 'pdf' : 'other'
            })
            .eq('id', uploadId);
            
    } catch (error) {
        console.error('Processing error:', error);
        await supabase
            .from('supplier_uploads')
            .update({ status: 'error', notes: error.message })
            .eq('id', uploadId);
    }
}

// Parse CSV file
async function parseCSV(file) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    const headers = lines[0].split(',').map(h => h.trim());
    
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const cols = {};
        headers.forEach((h, j) => {
            cols[h] = (values[j] || '').trim();
        });
        rows.push({ row_index: i - 1, raw: { cols } });
    }
    
    return rows;
}

// Parse Excel file
async function parseExcel(file) {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    const headers = jsonData[0] || [];
    const rows = [];
    
    for (let i = 1; i < jsonData.length; i++) {
        const cols = {};
        headers.forEach((h, j) => {
            cols[h] = (jsonData[i][j] || '').toString().trim();
        });
        rows.push({ row_index: i - 1, raw: { cols } });
    }
    
    return rows;
}

// Handle upload action based on status
async function handleUploadAction(uploadId, status, supplierId) {
    currentUploadId = uploadId;
    currentSupplierId = supplierId;
    
    switch (status) {
        case 'parsed':
            await showMappingEditor(uploadId);
            break;
        case 'mapped':
            await showNormalizeSection(uploadId);
            break;
        case 'normalized':
        case 'matrix_ready':
            await showNormalizeSection(uploadId);
            break;
        case 'approved':
            alert('This rate card is already approved and active.');
            break;
        default:
            console.log('Unknown status:', status);
    }
}

// Show mapping editor
async function showMappingEditor(uploadId) {
    try {
        // Get first row to extract headers
        const { data: rows, error } = await supabase
            .from('supplier_quote_raw_rows')
            .select('raw')
            .eq('upload_id', uploadId)
            .order('row_index')
            .limit(1);
        
        if (error) throw error;
        
        if (rows.length === 0) {
            alert('No data found for this upload');
            return;
        }
        
        const headers = Object.keys(rows[0].raw.cols || {});
        
        // Show mapping editor
        document.getElementById('mappingEditor').classList.remove('hidden');
        
        // Display available headers
        const headersList = document.getElementById('availableHeaders');
        headersList.innerHTML = headers.map(h => 
            `<div class="text-sm py-1 px-2 bg-gray-100 rounded mb-1">${h}</div>`
        ).join('');
        
        // Populate mapping dropdowns
        const mappingFields = ['material_per_m2', 'print_per_m2', 'included_colors', 
                              'setup_fee', 'plate_fee', 'waste_factor'];
        
        mappingFields.forEach(field => {
            const select = document.getElementById(`map_${field}`);
            select.innerHTML = '<option value="">-- Not mapped --</option>';
            headers.forEach(h => {
                const option = document.createElement('option');
                option.value = h;
                option.textContent = h;
                select.appendChild(option);
            });
        });
        
    } catch (error) {
        console.error('Error showing mapping editor:', error);
        alert('Failed to load mapping editor');
    }
}

// Save mapping profile
async function saveMappingProfile() {
    try {
        const headerMap = {
            material_per_m2: document.getElementById('map_material_per_m2').value,
            print_per_m2: document.getElementById('map_print_per_m2').value,
            included_colors: document.getElementById('map_included_colors').value,
            setup_fee: document.getElementById('map_setup_fee').value,
            plate_fee: document.getElementById('map_plate_fee').value,
            waste_factor: document.getElementById('map_waste_factor').value
        };
        
        // Save mapping profile
        const { data: profileData, error: profileError } = await supabase
            .from('supplier_mapping_profiles')
            .upsert({
                supplier_id: currentSupplierId,
                profile_name: 'default',
                header_map: headerMap
            })
            .select()
            .single();
        
        if (profileError) throw profileError;
        
        // Update upload status
        await supabase
            .from('supplier_uploads')
            .update({ status: 'mapped' })
            .eq('id', currentUploadId);
        
        // Hide mapping editor and show normalize section
        document.getElementById('mappingEditor').classList.add('hidden');
        await showNormalizeSection(currentUploadId);
        
        // Reload uploads table
        await loadRecentUploads();
        
    } catch (error) {
        console.error('Error saving mapping:', error);
        alert('Failed to save mapping profile');
    }
}

// Show normalize section
async function showNormalizeSection(uploadId) {
    document.getElementById('normalizeSection').classList.remove('hidden');
    await loadProductConfigs();
}

// Load product configurations
async function loadProductConfigs() {
    try {
        const family = document.getElementById('familySelect').value;
        
        const { data: configs, error } = await supabase
            .from('product_configs')
            .select(`
                *,
                products!inner (
                    name,
                    family
                )
            `)
            .eq('products.family', family);
        
        if (error) throw error;
        
        const select = document.getElementById('configSelect');
        select.innerHTML = '<option value="">-- Select Product --</option>';
        
        configs.forEach(config => {
            const option = document.createElement('option');
            option.value = config.id;
            option.textContent = `${config.products.name} - ${JSON.stringify(config.attrs)}`;
            select.appendChild(option);
        });
        
    } catch (error) {
        console.error('Error loading configs:', error);
    }
}

// Preview pricing matrix
async function previewPricingMatrix() {
    try {
        const family = document.getElementById('familySelect').value;
        const configId = document.getElementById('configSelect').value;
        const quantities = document.getElementById('quantitiesInput').value
            .split(',')
            .map(q => parseInt(q.trim()))
            .filter(q => !isNaN(q));
        
        if (!configId || quantities.length === 0) {
            alert('Please select a product and enter quantities');
            return;
        }
        
        // Get mapping profile
        const { data: profile, error: profileError } = await supabase
            .from('supplier_mapping_profiles')
            .select('*')
            .eq('supplier_id', currentSupplierId)
            .eq('profile_name', 'default')
            .single();
        
        if (profileError) throw profileError;
        
        // Normalize upload to staging
        const { error: normalizeError } = await supabase.rpc('normalize_upload_to_staging', {
            p_upload_id: currentUploadId,
            p_family: family,
            p_profile_id: profile.id
        });
        
        if (normalizeError) throw normalizeError;
        
        // Generate matrix from staging
        const { data: matrix, error: matrixError } = await supabase.rpc('generate_matrix_from_staging', {
            p_upload_id: currentUploadId,
            p_config_id: configId,
            p_qty_list: quantities
        });
        
        if (matrixError) throw matrixError;
        
        // Display matrix
        const tbody = document.getElementById('matrixTable');
        tbody.innerHTML = '';
        
        matrix.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">${row.qty.toLocaleString()}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">$${row.landed.toFixed(2)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">${(row.margin * 100).toFixed(0)}%</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold">$${row.price.toFixed(2)}</td>
                <td class="px-6 py-4 text-xs">
                    <details>
                        <summary class="cursor-pointer text-blue-600">View</summary>
                        <pre class="mt-2 text-xs">${JSON.stringify(row.breakdown, null, 2)}</pre>
                    </details>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        document.getElementById('matrixPreview').classList.remove('hidden');
        document.getElementById('approveBtn').disabled = false;
        
    } catch (error) {
        console.error('Error generating matrix:', error);
        alert('Failed to generate pricing matrix: ' + error.message);
    }
}

// Approve rate card
async function approveRateCard() {
    if (!confirm('Are you sure you want to approve and publish this rate card? It will become the active rate card for this supplier.')) {
        return;
    }
    
    try {
        const { data, error } = await supabase.rpc('publish_staging_rate_card', {
            p_upload_id: currentUploadId
        });
        
        if (error) throw error;
        
        alert('Rate card approved and published successfully!');
        
        // Hide sections and reload
        document.getElementById('normalizeSection').classList.add('hidden');
        await loadRecentUploads();
        
    } catch (error) {
        console.error('Error approving rate card:', error);
        alert('Failed to approve rate card: ' + error.message);
    }
}

// Reject upload
async function rejectUpload() {
    if (!confirm('Are you sure you want to reject this upload?')) {
        return;
    }
    
    try {
        await supabase
            .from('supplier_uploads')
            .update({ status: 'rejected' })
            .eq('id', currentUploadId);
        
        document.getElementById('normalizeSection').classList.add('hidden');
        await loadRecentUploads();
        
    } catch (error) {
        console.error('Error rejecting upload:', error);
        alert('Failed to reject upload');
    }
}

// Export functions for external use
window.supplierPricing = {
    loadSuppliers,
    loadRecentUploads,
    handleUpload,
    handleUploadAction
};