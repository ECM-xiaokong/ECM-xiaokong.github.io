// Supabase browser client configuration.
const SUPABASE_URL = 'https://hmkgeaybusuaecrseybm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhta2dlYXlidXN1YWVjcnNleWJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwODc2NzgsImV4cCI6MjEwMjY2MzY3OH0.EGo9sluYj2-_gSCHU65J8ktdBdhShgISs0MggrwvLws';

if (!window.supabase) {
	console.error('Supabase SDK failed to load. Check the network connection.');
} else {
	window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
