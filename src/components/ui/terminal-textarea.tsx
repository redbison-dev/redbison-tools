
import * as React from "react"
import { cn } from "@/lib/utils"
import { Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

export interface TerminalTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  showCopy?: boolean;
  copyLabel?: string;
}

const TerminalTextarea = React.forwardRef<HTMLTextAreaElement, TerminalTextareaProps>(
  ({ className, showCopy = false, copyLabel = "Result", value, ...props }, ref) => {
    const { toast } = useToast();

    const handleCopy = () => {
      if (value) {
        navigator.clipboard.writeText(value.toString());
        toast({
          title: "Copied!",
          description: `${copyLabel} copied to clipboard`,
        });
      }
    };

    return (
      <div className="relative">
        <textarea
          className={cn(
            "flex min-h-[120px] w-full bg-white text-black font-mono text-sm p-4 border-2 border-gray-300 rounded-lg resize-vertical focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 placeholder:text-gray-500",
            "scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100",
            className
          )}
          style={{ fontFamily: "'Courier New', monospace" }}
          ref={ref}
          value={value}
          {...props}
        />
        {showCopy && value && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="absolute top-2 right-2 h-8 w-8 p-0 bg-white border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-black"
          >
            <Copy className="h-4 w-4" />
          </Button>
        )}
      </div>
    )
  }
)
TerminalTextarea.displayName = "TerminalTextarea"

export { TerminalTextarea }
