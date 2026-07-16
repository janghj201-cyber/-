// Supabase 클라이언트 — vflow-prod와 동일한 프로젝트(vbuhueykvizmnrfvkehq)를 그대로 씀.
// publishable(anon) key는 브라우저 노출 안전(RLS가 실제 접근 통제). 서비스 키는 여기 안 둠.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://vbuhueykvizmnrfvkehq.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_rN-ya2PiiA82dcG-8LyVvQ_gqS7RiLg'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
