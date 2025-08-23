# SHW Production Webapp

A comprehensive production management web application for ShurePrint/Hwood Group's sales and production teams. This system handles quote creation, customer approvals, order tracking, and payment processing with full integration to Trello, Airtable, and payment systems.

## Production Features

### Core Functionality
- **Quote Management**: Create, edit, and track quotes with full audit trail
- **Customer Approval System**: Secure links for customers to review and approve quotes
- **PDF Generation**: Professional quote PDFs with company branding
- **Email Service**: Automated quote delivery and payment reminders
- **Payment Delegation**: Allow customers to delegate payment to accounting teams

### Integrations
- **Trello Integration**: Automatic card creation and PDF attachments on approval
- **Airtable Integration**: Real-time product catalog and pricing sync
- **Supabase Backend**: Secure quote storage and retrieval
- **Stripe Payments**: Secure payment processing for deposits and final payments

### Production Team Features
- **Order Tracking**: Monitor quote status from creation to fulfillment
- **Automated Reminders**: 7-day, 14-day, and urgent payment reminders
- **Sales Dashboard**: Track team performance and quote metrics
- **Brand Aligned**: Professional design matching shureprint.com

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with your API credentials:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_key
   VITE_TRELLO_API_KEY=your_trello_api_key
   VITE_TRELLO_TOKEN=your_trello_token
   VITE_TRELLO_BOARD_ID=your_board_id
   VITE_AIRTABLE_API_KEY=your_airtable_token
   VITE_AIRTABLE_BASE_ID=your_base_id
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```

## Usage

1. **Load Trello Lists**: Click "Load Lists" to fetch available Trello lists
2. **Select Cards**: Choose cards from Pre-Order Sales or Quoting to auto-populate quote details
3. **Load Product Catalog**: Click "Load Catalog" to fetch products from Airtable
4. **Build Quote**: Add products, set quantities, and customize pricing
5. **Save Quote**: Save quotes to Supabase for future reference

## TODO

### High Priority
- [ ] **Pull Option Types and Option Values from Airtable**
  - When a product is selected, fetch its associated Option Types from Airtable
  - Dynamically populate dropdowns/fields with available options (size, color, material, etc.)
  - Store option values with the quote line items
  - Update pricing based on selected options

### Implementation Notes for Option Types:
1. Airtable has `Option Types` field that links to options table
2. Each option type may have multiple values (e.g., Size: Small, Medium, Large)
3. Options may affect pricing (need to fetch price modifiers)
4. UI should dynamically show relevant options for each product
5. Consider storing selected options in quote items for later retrieval

### Future Enhancements
- [ ] Email quote documents to customers
- [ ] PDF generation for quotes
- [ ] Firebase hosting deployment
- [ ] Quote approval workflow
- [ ] Customer portal for quote review

## Tech Stack

- **Frontend**: Vanilla JavaScript, Vite
- **Database**: Supabase (PostgreSQL)
- **APIs**: Trello, Airtable
- **Hosting**: Firebase (planned)

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## Repository

Push to: `shurehw/shureprint/quote-builder`

## License

Internal use only - ShurePrint LA