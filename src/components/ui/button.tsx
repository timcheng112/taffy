import { forwardRef } from "react";

type ButtonProps = React.ComponentPropsWithoutRef<"button"> & {
  variant?: "primary" | "secondary";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className = "", variant = "primary", type = "button", ...props },
  ref,
) {
  return (
    <button
      className={`button button-${variant} ${className}`.trim()}
      ref={ref}
      type={type}
      {...props}
    />
  );
});
