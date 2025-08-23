// Consistent SHUREPRINT Email Template
const emailTemplate = {
    // Brand colors
    colors: {
        cream: '#FFF9F0',
        gold: '#E3FF33',
        ink: '#111111',
        text: '#333333',
        muted: '#666666',
        stroke: '#E2DFDA',
        bg: '#FAF9F7',
        error: '#dc3545',
        warning: '#ff9800',
        success: '#28a745'
    },

    // Generate consistent email header
    header: (title = 'SHUREPRINT') => `
        <div style="background-color: #FFF9F0; padding: 20px; text-align: center; border-bottom: 2px solid #E2DFDA;">
            <h1 style="color: #111111; margin: 0; font-weight: 800; letter-spacing: 0.08em;">SHUREPRINT</h1>
            ${title !== 'SHUREPRINT' ? `<p style="color: #666666; margin: 5px 0; font-size: 14px;">${title}</p>` : ''}
        </div>
    `,

    // Generate consistent email footer
    footer: () => `
        <div style="background-color: #FAF9F7; padding: 20px; text-align: center; border-top: 2px solid #E2DFDA; margin-top: 30px;">
            <p style="color: #666666; font-size: 12px; margin: 0;">
                © ${new Date().getFullYear()} SHUREPRINT. All rights reserved.<br>
                This email is confidential and intended solely for the addressee.
            </p>
        </div>
    `,

    // Generate action button
    button: (text, url, primary = true) => `
        <div style="text-align: center; margin: 30px 0;">
            <a href="${url}"
               style="background-color: ${primary ? '#E3FF33' : '#FAF9F7'}; 
                      color: #111111; 
                      padding: 15px 30px; 
                      border: 2px solid #111111;
                      text-decoration: none; 
                      border-radius: 8px; 
                      font-weight: 800; 
                      display: inline-block; 
                      font-size: 14px; 
                      letter-spacing: 0.5px;">
                ${text}
            </a>
        </div>
    `,

    // Generate info box
    infoBox: (content, borderColor = '#E2DFDA') => `
        <div style="background-color: #FAF9F7; border: 1px solid ${borderColor}; padding: 15px; margin: 20px 0; border-radius: 8px;">
            ${content}
        </div>
    `,

    // Generate alert box
    alertBox: (content, type = 'info') => {
        const colors = {
            info: { bg: '#FAF9F7', border: '#E2DFDA', text: '#333333' },
            warning: { bg: '#fff8e1', border: '#ffc107', text: '#856404' },
            error: { bg: '#fff5f5', border: '#dc3545', text: '#721c24' },
            success: { bg: '#f0f8f0', border: '#28a745', text: '#155724' }
        };
        const style = colors[type] || colors.info;
        
        return `
            <div style="background-color: ${style.bg}; border: 1px solid ${style.border}; padding: 15px; margin: 20px 0; border-radius: 8px;">
                <div style="color: ${style.text};">${content}</div>
            </div>
        `;
    },

    // Generate complete email wrapper
    wrapper: (content) => `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #FFF9F0;">
            ${content}
        </div>
    `,

    // Generate body section
    body: (content) => `
        <div style="padding: 30px 20px; background-color: #FFF9F0;">
            ${content}
        </div>
    `,

    // Text styles
    heading: (text) => `<h2 style="color: #111111; margin-top: 0;">${text}</h2>`,
    paragraph: (text) => `<p style="color: #333333;">${text}</p>`,
    strong: (text) => `<strong style="color: #111111;">${text}</strong>`,
    muted: (text) => `<span style="color: #666666; font-size: 14px;">${text}</span>`
};

module.exports = emailTemplate;