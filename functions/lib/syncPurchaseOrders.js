"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", { value: true });
exports.sosWebhookReceiver = exports.syncPurchaseOrdersFromSOS = void 0;
const functions = __importStar(require("firebase-functions"));
const axios = require("axios");
const moment = require("moment-timezone");
// Configuration
const SOS_CLIENT_ID = ((_a = functions.config().sos) === null || _a === void 0 ? void 0 : _a.client_id) || "";
const SOS_CLIENT_SECRET = ((_b = functions.config().sos) === null || _b === void 0 ? void 0 : _b.client_secret) || "";
const SOS_API_URL = ((_c = functions.config().sos) === null || _c === void 0 ? void 0 : _c.api_url) || "https://api.sosinventory.com/api/v2";
// SOS Authentication
async function getSosAccessToken() {
    var _a;
    try {
        console.log("Getting SOS access token...");
        const tokenResponse = await axios.post(`${SOS_API_URL}/oauth/token`, {
            grant_type: "client_credentials",
            client_id: SOS_CLIENT_ID,
            client_secret: SOS_CLIENT_SECRET,
            scope: "read write"
        }, {
            headers: {
                "Content-Type": "application/json"
            }
        });
        console.log("Successfully obtained SOS access token");
        return tokenResponse.data.access_token;
    }
    catch (error) {
        console.error("Error getting SOS access token:", ((_a = error.response) === null || _a === void 0 ? void 0 : _a.data) || error.message);
        throw new Error("Failed to authenticate with SOS Inventory");
    }
}
// Fetch Purchase Orders from SOS
async function fetchPurchaseOrdersFromSOS(startDate, endDate, orderId) {
    var _a, _b;
    try {
        const accessToken = await getSosAccessToken();
        console.log(`Fetching POs from SOS - Start: ${startDate}, End: ${endDate}, OrderID: ${orderId}`);
        let url = `${SOS_API_URL}/purchaseorder`;
        const params = {
            start: 1,
            maxresults: 100
        };
        // Add date filters if provided
        if (startDate) {
            params.updatedsince = moment(startDate).toISOString();
        }
        if (endDate) {
            params.updateduntil = moment(endDate).endOf('day').toISOString();
        }
        // If specific order ID is provided
        if (orderId) {
            url = `${SOS_API_URL}/purchaseorder/${orderId}`;
        }
        console.log("SOS API Request:", { url, params });
        const response = await axios.get(url, {
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Accept": "application/json"
            },
            params: orderId ? {} : params
        });
        console.log(`Fetched ${orderId ? '1' : ((_a = response.data) === null || _a === void 0 ? void 0 : _a.length) || 0} purchase order(s) from SOS`);
        // Handle single order vs multiple orders
        if (orderId) {
            return response.data ? [response.data] : [];
        }
        return Array.isArray(response.data) ? response.data : [];
    }
    catch (error) {
        console.error("Error fetching POs from SOS:", ((_b = error.response) === null || _b === void 0 ? void 0 : _b.data) || error.message);
        throw error;
    }
}
// Transform SOS PO items to match Airtable webhook format
function transformPOItemsForAirtable(sosPOs) {
    var _a, _b;
    const purchaseOrderItems = [];
    for (const po of sosPOs) {
        // Get line items from the PO
        const lineItems = po.lineItems || po.purchaseOrderLines || po.items || [];
        for (const item of lineItems) {
            purchaseOrderItems.push({
                id: item.id || `${po.id}_${item.productId}`,
                order_id: po.id,
                order_number: po.purchaseOrderNumber || po.number,
                product: item.productId || ((_a = item.product) === null || _a === void 0 ? void 0 : _a.id),
                supplier: {
                    name: ((_b = po.vendor) === null || _b === void 0 ? void 0 : _b.name) || po.vendorName || ""
                },
                quantity: item.quantity || item.qty || 0,
                received: item.quantityReceived || item.received || 0,
                unitprice: item.unitPrice || item.price || 0,
                amount: item.amount || (item.quantity * item.unitPrice) || 0,
                date: po.date || po.orderDate || moment().format("YYYY-MM-DD"),
                status: po.status === "closed" || po.status === "complete",
                // Additional fields that might be useful
                description: item.description || item.name || "",
                sku: item.sku || ""
            });
        }
    }
    return purchaseOrderItems;
}
// Send POs to Airtable webhook
async function sendPOsToAirtable(purchaseOrders) {
    var _a, _b;
    try {
        // Transform all POs to the format expected by Airtable
        const purchaseOrderItems = transformPOItemsForAirtable(purchaseOrders);
        if (purchaseOrderItems.length === 0) {
            return {
                successful: 0,
                failed: 0,
                errors: ["No items to send"]
            };
        }
        console.log(`Sending ${purchaseOrderItems.length} purchase order items to Airtable webhook...`);
        // Send to the Airtable webhook that expects purchaseOrderItems
        const webhookUrl = "https://hooks.airtable.com/workflows/v1/genericWebhook/appKWq1KHqzZeJ3uF/wfleoPeyilI9b25Av/wtrmXPU9h2eUIc9ml";
        const webhookPayload = {
            purchaseOrderItems: JSON.stringify(purchaseOrderItems),
            timestamp: new Date().toISOString(),
            source: "SOS_Direct_Sync"
        };
        await axios.post(webhookUrl, webhookPayload, {
            headers: {
                "Content-Type": "application/json"
            }
        });
        console.log(`Successfully sent ${purchaseOrderItems.length} items to Airtable webhook`);
        return {
            successful: purchaseOrderItems.length,
            failed: 0,
            errors: []
        };
    }
    catch (error) {
        console.error("Error sending POs to Airtable:", ((_a = error.response) === null || _a === void 0 ? void 0 : _a.data) || error.message);
        return {
            successful: 0,
            failed: purchaseOrders.length,
            errors: [{
                    error: ((_b = error.response) === null || _b === void 0 ? void 0 : _b.data) || error.message
                }]
        };
    }
}
// Main function - Enhanced Purchase Order Sync
exports.syncPurchaseOrdersFromSOS = functions.https.onRequest(async (request, response) => {
    try {
        console.log("Starting Purchase Order sync from SOS to Airtable");
        console.log("Request body:", request.body);
        const { orderId, startDate, endDate, testMode } = request.body;
        // Input validation
        if (!startDate && !orderId) {
            response.status(400).json({
                error: "Please provide either a startDate or specific orderId"
            });
            return;
        }
        // Fetch POs from SOS
        const purchaseOrders = await fetchPurchaseOrdersFromSOS(startDate, endDate, orderId);
        if (purchaseOrders.length === 0) {
            response.json({
                message: "No purchase orders found for the specified criteria",
                criteria: { orderId, startDate, endDate }
            });
            return;
        }
        console.log(`Found ${purchaseOrders.length} purchase order(s) to sync`);
        // If test mode, just return the data without sending to Airtable
        if (testMode) {
            response.json({
                message: "Test mode - POs fetched but not sent to Airtable",
                count: purchaseOrders.length,
                orders: purchaseOrders.map((po) => {
                    var _a;
                    return ({
                        number: po.purchaseOrderNumber || po.number,
                        vendor: ((_a = po.vendor) === null || _a === void 0 ? void 0 : _a.name) || po.vendorName,
                        date: po.date,
                        total: po.totalAmount || po.total
                    });
                })
            });
            return;
        }
        // Send POs to Airtable
        const results = await sendPOsToAirtable(purchaseOrders);
        response.json({
            message: "Purchase order sync completed",
            totalProcessed: purchaseOrders.length,
            successful: results.successful,
            failed: results.failed,
            errors: results.errors,
            criteria: { orderId, startDate, endDate }
        });
    }
    catch (error) {
        console.error("Error in syncPurchaseOrdersFromSOS:", error);
        response.status(500).json({
            error: "Failed to sync purchase orders",
            details: error.message,
            stack: process.env.NODE_ENV === "development" ? error.stack : undefined
        });
    }
});
// Webhook endpoint to receive notifications from SOS
exports.sosWebhookReceiver = functions.https.onRequest(async (request, response) => {
    try {
        console.log("Received SOS webhook:", request.body);
        const { event, data } = request.body;
        if (event === "purchaseorder.created" || event === "purchaseorder.updated") {
            // Automatically sync the new/updated PO
            const orderId = data.id || data.purchaseOrderId;
            if (orderId) {
                console.log(`Auto-syncing PO ${orderId} triggered by webhook`);
                const purchaseOrders = await fetchPurchaseOrdersFromSOS(undefined, undefined, orderId);
                if (purchaseOrders.length > 0) {
                    const results = await sendPOsToAirtable(purchaseOrders);
                    console.log(`Webhook sync completed: ${results.successful} successful, ${results.failed} failed`);
                }
            }
        }
        response.status(200).json({
            message: "Webhook processed successfully"
        });
    }
    catch (error) {
        console.error("Error processing SOS webhook:", error);
        response.status(500).json({
            error: "Failed to process webhook",
            details: error.message
        });
    }
});
//# sourceMappingURL=syncPurchaseOrders.js.map