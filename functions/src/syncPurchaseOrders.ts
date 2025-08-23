import * as functions from "firebase-functions";
import { Request, Response } from "express";
const axios = require("axios");
const moment = require("moment-timezone");

// Configuration
const SOS_CLIENT_ID = functions.config().sos?.client_id || "";
const SOS_CLIENT_SECRET = functions.config().sos?.client_secret || "";
const SOS_API_URL = functions.config().sos?.api_url || "https://api.sosinventory.com/api/v2";

// SOS Authentication
async function getSosAccessToken(): Promise<string> {
  try {
    console.log("Getting SOS access token...");
    const tokenResponse = await axios.post(
      `${SOS_API_URL}/oauth/token`,
      {
        grant_type: "client_credentials",
        client_id: SOS_CLIENT_ID,
        client_secret: SOS_CLIENT_SECRET,
        scope: "read write"
      },
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
    
    console.log("Successfully obtained SOS access token");
    return tokenResponse.data.access_token;
  } catch (error: any) {
    console.error("Error getting SOS access token:", error.response?.data || error.message);
    throw new Error("Failed to authenticate with SOS Inventory");
  }
}

// Fetch Purchase Orders from SOS
async function fetchPurchaseOrdersFromSOS(startDate?: string, endDate?: string, orderId?: string) {
  try {
    const accessToken = await getSosAccessToken();
    console.log(`Fetching POs from SOS - Start: ${startDate}, End: ${endDate}, OrderID: ${orderId}`);
    
    let url = `${SOS_API_URL}/purchaseorder`;
    const params: any = {
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
    
    console.log(`Fetched ${orderId ? '1' : response.data?.length || 0} purchase order(s) from SOS`);
    
    // Handle single order vs multiple orders
    if (orderId) {
      return response.data ? [response.data] : [];
    }
    
    return Array.isArray(response.data) ? response.data : [];
  } catch (error: any) {
    console.error("Error fetching POs from SOS:", error.response?.data || error.message);
    throw error;
  }
}

// Transform SOS PO items to match Airtable webhook format
function transformPOItemsForAirtable(sosPOs: any[]) {
  const purchaseOrderItems: any[] = [];
  
  for (const po of sosPOs) {
    // Get line items from the PO
    const lineItems = po.lineItems || po.purchaseOrderLines || po.items || [];
    
    for (const item of lineItems) {
      purchaseOrderItems.push({
        id: item.id || `${po.id}_${item.productId}`,
        order_id: po.id,
        order_number: po.purchaseOrderNumber || po.number,
        product: item.productId || item.product?.id,
        supplier: {
          name: po.vendor?.name || po.vendorName || ""
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
async function sendPOsToAirtable(purchaseOrders: any[]) {
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
    
  } catch (error: any) {
    console.error("Error sending POs to Airtable:", error.response?.data || error.message);
    
    return {
      successful: 0,
      failed: purchaseOrders.length,
      errors: [{
        error: error.response?.data || error.message
      }]
    };
  }
}

// Main function - Enhanced Purchase Order Sync
export const syncPurchaseOrdersFromSOS = functions.https.onRequest(async (request: Request, response: Response) => {
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
        orders: purchaseOrders.map((po: any) => ({
          number: po.purchaseOrderNumber || po.number,
          vendor: po.vendor?.name || po.vendorName,
          date: po.date,
          total: po.totalAmount || po.total
        }))
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
    
  } catch (error: any) {
    console.error("Error in syncPurchaseOrdersFromSOS:", error);
    response.status(500).json({
      error: "Failed to sync purchase orders",
      details: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
});

// Webhook endpoint to receive notifications from SOS
export const sosWebhookReceiver = functions.https.onRequest(async (request: Request, response: Response) => {
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
    
  } catch (error: any) {
    console.error("Error processing SOS webhook:", error);
    response.status(500).json({
      error: "Failed to process webhook",
      details: error.message
    });
  }
});