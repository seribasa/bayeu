import { createClient } from 'jsr:@supabase/supabase-js@2'

const ENAKES_SUPABASE_URL = Deno.env.get('ENAKES_SUPABASE_URL')
const ENAKES_SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('ENAKES_SUPABASE_SERVICE_ROLE_KEY')
const ENAKES_SUPABASE_ANON_KEY = Deno.env.get('ENAKES_SUPABASE_ANON_KEY')

const enakesSupabaseAdmin = createClient(
  ENAKES_SUPABASE_URL ?? '',
  ENAKES_SUPABASE_SERVICE_ROLE_KEY ?? '',
)

const enakesSupabaseClient = (req: any) => createClient(
  ENAKES_SUPABASE_URL ?? '',
  ENAKES_SUPABASE_ANON_KEY ?? '',
  { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
)

export { enakesSupabaseAdmin, enakesSupabaseClient }