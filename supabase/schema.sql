-- ============================================================
-- 云笺 Supabase 数据库初始化脚本
-- 在 Supabase 控制台 SQL Editor 中执行以下 SQL
-- ============================================================

-- 1. 创建笔记表
CREATE TABLE IF NOT EXISTS public.notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT '新建笔记',
  content     TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 为 user_id 和 updated_at 创建索引，加速查询
CREATE INDEX IF NOT EXISTS notes_user_id_idx ON public.notes(user_id);
CREATE INDEX IF NOT EXISTS notes_updated_at_idx ON public.notes(updated_at DESC);

-- 2. 开启 updated_at 自动更新触发器
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER notes_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- 3. 开启行级安全策略（RLS）
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- 4. RLS 策略：用户只能查看自己的笔记
CREATE POLICY "用户只能查询自己的笔记"
  ON public.notes
  FOR SELECT
  USING (auth.uid() = user_id);

-- 5. RLS 策略：用户只能插入属于自己的笔记
CREATE POLICY "用户只能创建自己的笔记"
  ON public.notes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 6. RLS 策略：用户只能更新自己的笔记
CREATE POLICY "用户只能更新自己的笔记"
  ON public.notes
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 7. RLS 策略：用户只能删除自己的笔记
CREATE POLICY "用户只能删除自己的笔记"
  ON public.notes
  FOR DELETE
  USING (auth.uid() = user_id);

-- 8. 开启 Realtime 订阅（跨设备实时同步）
-- 在 Supabase 控制台 Table Editor -> notes -> Enable Realtime 开启
-- 或执行以下命令：
ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;
