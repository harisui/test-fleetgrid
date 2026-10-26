import { Smartphone } from "lucide-react";
import { SMS_SAMPLE_THREAD, SMS_SAMPLE_THREAD_LABEL, type SmsBubble } from "@/content/sms-samples";
import { cn } from "@/lib/utils";

interface SmsThreadProps {
  bubbles?: readonly SmsBubble[];
  /** The header line of the phone card. */
  header?: string;
  className?: string;
}

/**
 * A phone card with a text thread: incoming bubbles on the muted token, the driver's reply
 * on the selection token in Geist Mono. Static. The whole card has one label for screen
 * readers; the bubbles themselves are read as a list.
 */
export function SmsThread({ bubbles = SMS_SAMPLE_THREAD, header = "FleetGrid", className }: SmsThreadProps) {
  return (
    <div
      role="group"
      aria-label={SMS_SAMPLE_THREAD_LABEL}
      data-slot="sms-thread"
      className={cn(
        "flex w-full max-w-sm flex-col overflow-hidden rounded-card border border-border bg-card",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-helper leading-helper font-semibold">
        <Smartphone aria-hidden="true" className="size-5 text-muted-foreground" />
        {header}
      </div>
      <ol className="flex flex-col gap-3 p-4">
        {bubbles.map((bubble, index) => (
          <li
            key={index}
            data-direction={bubble.direction}
            className={cn("flex", bubble.direction === "out" ? "justify-end" : "justify-start")}
          >
            <span className="sr-only">{bubble.direction === "out" ? "You: " : "FleetGrid: "}</span>
            <span
              className={cn(
                "max-w-4/5 rounded-card px-3 py-2 text-helper leading-helper",
                bubble.direction === "out"
                  ? "bg-selection font-mono text-code leading-code tracking-code text-selection-foreground"
                  : "bg-muted text-foreground",
              )}
            >
              {bubble.text}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
