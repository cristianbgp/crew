import { useContext, useEffect } from "react";
import { StatusFeedbackContext } from "./StatusBar";
export function useFormFeedback(error: string) {
  const publish = useContext(StatusFeedbackContext);
  useEffect(() => {
    if (!error || !publish) return;
    publish({ text: error, error: true });
    return () => publish(null);
  }, [error, publish]);
}
