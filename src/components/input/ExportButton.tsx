import { Icon, LoadingButton, Tooltip, TooltipTrigger } from '@umami/react-zen';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useMessages } from '@/components/hooks';
import { useDateParameters } from '@/components/hooks/useDateParameters';
import { useFilterParameters } from '@/components/hooks/useFilterParameters';
import { Download } from '@/components/icons';

export function ExportButton({ websiteId }: { websiteId: string }) {
  const { t, labels } = useMessages();
  const [isLoading, setIsLoading] = useState(false);
  const date = useDateParameters();
  const filters = useFilterParameters();
  const searchParams = useSearchParams();
  const handleClick = async () => {
    setIsLoading(true);

    const params = new URLSearchParams({
      ...date,
      ...filters,
      ...Object.fromEntries(searchParams.entries()),
    });

    const response = await fetch(`/api/websites/${websiteId}/export?${params}`);

    if (!response.ok) {
      setIsLoading(false);
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'export.zip';
    a.click();
    URL.revokeObjectURL(url);

    setIsLoading(false);
  };

  return (
    <TooltipTrigger delay={0}>
      <LoadingButton
        variant="quiet"
        showText={!isLoading}
        isLoading={isLoading}
        onClick={handleClick}
      >
        <Icon>
          <Download />
        </Icon>
      </LoadingButton>
      <Tooltip>{t(labels.download)}</Tooltip>
    </TooltipTrigger>
  );
}
