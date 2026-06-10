// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UmamiEventData = Record<string, any>;

interface UmamiTracker {
  track(
    event: string | ((props: UmamiEventData) => UmamiEventData),
    data?: UmamiEventData,
  ): void;
  identify(data: Record<string, unknown>): void;
}

interface Window {
  umami: UmamiTracker;
}
