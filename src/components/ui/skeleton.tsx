import { cn } from "cn"

/** A flat grey bar at the size of the value it stands in for. Still on purpose: nothing animates continuously. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
