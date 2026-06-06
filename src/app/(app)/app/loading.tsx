export default function AppLoading() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="h-4 w-20 rounded bg-[#3a3a3a]" />
          <div className="h-7 w-44 rounded bg-[#303030]" />
        </div>
        <div className="h-11 w-11 rounded-md bg-[#303030]" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.18fr_0.82fr]">
        <div className="mac-panel h-72 animate-pulse" />
        <div className="mac-panel h-72 animate-pulse" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="mac-panel h-48 animate-pulse" />
        <div className="mac-panel h-48 animate-pulse" />
      </div>
    </div>
  );
}
