# ShurePrint Quote Builder

A web-based quote builder application for ShurePrint's sales team to create custom quotes for print products.

## Features

- **Trello Integration**: Pull project details from Trello boards (Pre-Order Sales/Quoting lists)
- **Airtable Integration**: Load product catalog and pricing from Airtable
- **Supabase Backend**: Store and manage quotes
- **Brand Aligned**: Styled to match shureprint.com branding

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