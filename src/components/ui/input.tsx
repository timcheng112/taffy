import { forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, React.ComponentPropsWithoutRef<"input">>(
  function Input({ className = "", ...props }, ref) {
    return <input className={`input ${className}`.trim()} ref={ref} {...props} />;
  },
);
