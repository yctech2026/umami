'use client';
import { Column, Dialog, Modal, type ModalProps } from '@umami/react-zen';
import { ReplayPlayback } from '@/app/(main)/websites/[websiteId]/replays/[replayId]/ReplayPlayback';
import { useNavigation } from '@/components/hooks';

export interface ReplayModalProps extends ModalProps {
  websiteId: string;
  sessionId?: string;
}

export function ReplayModal({ websiteId, sessionId, ...props }: ReplayModalProps) {
  const {
    router,
    query: { replay },
    updateParams,
  } = useNavigation();

  const replayId = sessionId ?? replay;

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      router.push(updateParams({ replay: undefined }));
    }
  };

  return (
    <Modal
      placement="bottom"
      offset="80px"
      isOpen={!!replayId}
      onOpenChange={handleOpenChange}
      isDismissable
      {...props}
    >
      <Column height="100%" maxWidth="1320px" style={{ margin: '0 auto' }}>
        <Dialog variant="sheet">
          {({ close }) => (
            <Column padding="6">
              <ReplayPlayback websiteId={websiteId} replayId={replayId} onClose={close} />
            </Column>
          )}
        </Dialog>
      </Column>
    </Modal>
  );
}
