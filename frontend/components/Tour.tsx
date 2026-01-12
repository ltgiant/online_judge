import dynamic from "next/dynamic";
import type { CallBackProps, Step } from "react-joyride";
import { STATUS } from "react-joyride";

const Joyride = dynamic(() => import("react-joyride"), { ssr: false }); // ssr: false -> render on client side only (no server side rendering)

type TourProps = {
  steps: Step[];
  run: boolean;
  onFinish?: () => void;
  onStepChange?: (data: CallBackProps) => void;
};

export default function Tour({ steps, run, onFinish, onStepChange }: TourProps) {
  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      showProgress
      showSkipButton
      disableOverlayClose
      hideCloseButton
      styles={{ options: { zIndex: 10000 } }} // Ensure the tour is on top of other elements
      callback={(data) => {
        onStepChange?.(data);
        if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
          onFinish?.();
        }
      }}
    />
  );
}
