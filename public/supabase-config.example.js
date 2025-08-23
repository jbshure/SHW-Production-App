// Supabase Configuration
// 
// To set up your Supabase connection:
// 1. Create a Supabase account at https://supabase.com
// 2. Create a new project
// 3. Go to Settings > API in your Supabase dashboard
// 4. Copy your Project URL and anon/public key
// 5. Create a file called 'supabase-config.js' in this directory
// 6. Copy this template and replace with your actual values
// 7. Update product-catalog.js to import from supabase-config.js

// Example configuration:
const SUPABASE_CONFIG = {
    url: 'https://your-project.supabase.co',
    anonKey: 'your-anon-key-here'
};

// If you want to use environment variables instead:
// const SUPABASE_CONFIG = {
//     url: process.env.SUPABASE_URL,
//     anonKey: process.env.SUPABASE_ANON_KEY
// };