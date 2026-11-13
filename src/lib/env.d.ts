declare const __CUSTOM_SFX__: string;

// AdsGram native Task web component (registered by https://sad.adsgram.ai/js/sad.min.js)
declare namespace React {
  namespace JSX {
    interface IntrinsicElements {
      "adsgram-task": import("react").DetailedHTMLProps<import("react").HTMLAttributes<HTMLElement>, HTMLElement> & { "data-block-id"?: string; "data-debug"?: string };
    }
  }
}
