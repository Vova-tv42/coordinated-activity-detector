import { Badge } from '@/components/ui/badge';

const SOURCE_KIND_LABELS = {
  telegram: 'Telegram',
  upload: 'Файл',
} as const;

type SourceKindBadgeProps = {
  kind: keyof typeof SOURCE_KIND_LABELS;
};

export function SourceKindBadge({ kind }: SourceKindBadgeProps) {
  return <Badge variant="secondary">{SOURCE_KIND_LABELS[kind]}</Badge>;
}
