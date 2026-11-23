import React from 'react';
import { Thumbnail } from '@remotion/player';

import AnimatedList from './animated-list';
import AnimatedText from './animated-text';
import AreaChart from './area-chart';
import BlindsTransition from './blinds-transition';
import BokehCircles from './bokeh-circles';
import BounceText from './bounce-text';
import BubblePopText from './bubble-pop-text';
import CameraShake from './camera-shake';
import CardFlip from './card-flip';
import ChapterTitle from './chapter-title';
import ChartAnimation from './chart-animation';
import CinematicTitleIntro from './cinematic-title-intro';
import CircularProgress from './circular-progress';
import ClockWipe from './clock-wipe';
import ComparisonChart from './comparison-chart';
import CountdownIntro from './countdown-intro';
import CountdownTimer from './countdown-timer';
import CreditsRoll from './credits-roll';
import CrossDissolve from './cross-dissolve';
import DonutChart from './donut-chart';
import EndCard from './end-card';
import FadeThroughBlack from './fade-through-black';
import FilmBurn from './film-burn';
import FloatingBubbleText from './floating-bubble-text';
import GalleryGrid from './gallery-grid';
import GeometricPatterns from './geometric-patterns';
import GlitchText from './glitch-text';
import GradientShift from './gradient-shift';
import GridPulse from './grid-pulse';
import ImageCarousel from './image-carousel';
import ImageComparisonSlider from './image-comparison-slider';
import ImageZoomReveal from './image-zoom-reveal';
import IrisTransition from './iris-transition';
import KenBurns from './ken-burns';
import LetterboxReveal from './letterbox-reveal';
import LineChart from './line-chart';
import LiquidWave from './liquid-wave';
import LogoBlurReveal from './logo-blur-reveal';
import LogoBounceDrop from './logo-bounce-drop';
import LogoFadeReveal from './logo-fade-reveal';
import LogoGlitchReveal from './logo-glitch-reveal';
import LogoScaleRotate from './logo-scale-rotate';
import LogoSpinReveal from './logo-spin-reveal';
import LogoSplitReveal from './logo-split-reveal';
import LogoStrokeDraw from './logo-stroke-draw';
import LogoTypewriter from './logo-typewriter';
import LowerThird from './lower-third';
import MasonryGallery from './masonry-gallery';
import MatrixRain from './matrix-rain';
import MorphTransition from './morph-transition';
import NoiseGrain from './noise-grain';
import NotificationPop from './notification-pop';
import ParallaxPan from './parallax-pan';
import ParticleExplosion from './particle-explosion';
import PhotoStack from './photo-stack';
import PictureInPicture from './picture-in-picture';
import PieChart from './pie-chart';
import PixelTransition from './pixel-transition';
import PolaroidFrame from './polaroid-frame';
import PoppingText from './popping-text';
import ProgressBars from './progress-bars';
import ProgressSteps from './progress-steps';
import PulsingText from './pulsing-text';
import PushTransition from './push-transition';
import QuoteCard from './quote-card';
import RotatingCarousel from './rotating-carousel';
import SlideText from './slide-text';
import SlideWipe from './slide-wipe';
import SoundWave from './sound-wave';
import SplitScreen from './split-screen';
import SpotlightReveal from './spotlight-reveal';
import Starfield from './starfield';
import StatCounter from './stat-counter';
import SubscribeReminder from './subscribe-reminder';
import TextHighlight from './text-highlight';
import TitleSplit from './title-split';
import TypewriterSubtitle from './typewriter-subtitle';
import VignettePulse from './vignette-pulse';
import WhipPan from './whip-pan';
import ZoomPulse from './zoom-pulse';
import ZoomThrough from './zoom-through';

export interface OpenSourceTemplateMeta {
  id: string;
  name: string;
  category: string;
  component: React.ComponentType<any>;
}

export const OPEN_SOURCE_TEMPLATES: Record<string, React.ComponentType<any>> = {
  'animated-list': AnimatedList,
  'animated_list': AnimatedList,
  'animated-text': AnimatedText,
  'animated_text': AnimatedText,
  'area-chart': AreaChart,
  'area_chart': AreaChart,
  'blinds-transition': BlindsTransition,
  'blinds_transition': BlindsTransition,
  'bokeh-circles': BokehCircles,
  'bokeh_circles': BokehCircles,
  'bounce-text': BounceText,
  'bounce_text': BounceText,
  'bubble-pop-text': BubblePopText,
  'bubble_pop_text': BubblePopText,
  'camera-shake': CameraShake,
  'camera_shake': CameraShake,
  'card-flip': CardFlip,
  'card_flip': CardFlip,
  'chapter-title': ChapterTitle,
  'chapter_title': ChapterTitle,
  'chart-animation': ChartAnimation,
  'chart_animation': ChartAnimation,
  'cinematic-title-intro': CinematicTitleIntro,
  'cinematic_title_intro': CinematicTitleIntro,
  'circular-progress': CircularProgress,
  'circular_progress': CircularProgress,
  'clock-wipe': ClockWipe,
  'clock_wipe': ClockWipe,
  'comparison-chart': ComparisonChart,
  'comparison_chart': ComparisonChart,
  'countdown-intro': CountdownIntro,
  'countdown_intro': CountdownIntro,
  'countdown-timer': CountdownTimer,
  'countdown_timer': CountdownTimer,
  'credits-roll': CreditsRoll,
  'credits_roll': CreditsRoll,
  'cross-dissolve': CrossDissolve,
  'cross_dissolve': CrossDissolve,
  'donut-chart': DonutChart,
  'donut_chart': DonutChart,
  'end-card': EndCard,
  'end_card': EndCard,
  'fade-through-black': FadeThroughBlack,
  'fade_through_black': FadeThroughBlack,
  'film-burn': FilmBurn,
  'film_burn': FilmBurn,
  'floating-bubble-text': FloatingBubbleText,
  'floating_bubble_text': FloatingBubbleText,
  'gallery-grid': GalleryGrid,
  'gallery_grid': GalleryGrid,
  'geometric-patterns': GeometricPatterns,
  'geometric_patterns': GeometricPatterns,
  'glitch-text': GlitchText,
  'glitch_text': GlitchText,
  'gradient-shift': GradientShift,
  'gradient_shift': GradientShift,
  'grid-pulse': GridPulse,
  'grid_pulse': GridPulse,
  'image-carousel': ImageCarousel,
  'image_carousel': ImageCarousel,
  'image-comparison-slider': ImageComparisonSlider,
  'image_comparison_slider': ImageComparisonSlider,
  'image-zoom-reveal': ImageZoomReveal,
  'image_zoom_reveal': ImageZoomReveal,
  'iris-transition': IrisTransition,
  'iris_transition': IrisTransition,
  'ken-burns': KenBurns,
  'ken_burns': KenBurns,
  'letterbox-reveal': LetterboxReveal,
  'letterbox_reveal': LetterboxReveal,
  'line-chart': LineChart,
  'line_chart': LineChart,
  'liquid-wave': LiquidWave,
  'liquid_wave': LiquidWave,
  'logo-blur-reveal': LogoBlurReveal,
  'logo_blur_reveal': LogoBlurReveal,
  'logo-bounce-drop': LogoBounceDrop,
  'logo_bounce_drop': LogoBounceDrop,
  'logo-fade-reveal': LogoFadeReveal,
  'logo_fade_reveal': LogoFadeReveal,
  'logo-glitch-reveal': LogoGlitchReveal,
  'logo_glitch_reveal': LogoGlitchReveal,
  'logo-scale-rotate': LogoScaleRotate,
  'logo_scale_rotate': LogoScaleRotate,
  'logo-spin-reveal': LogoSpinReveal,
  'logo_spin_reveal': LogoSpinReveal,
  'logo-split-reveal': LogoSplitReveal,
  'logo_split_reveal': LogoSplitReveal,
  'logo-stroke-draw': LogoStrokeDraw,
  'logo_stroke_draw': LogoStrokeDraw,
  'logo-typewriter': LogoTypewriter,
  'logo_typewriter': LogoTypewriter,
  'lower-third': LowerThird,
  'lower_third': LowerThird,
  'masonry-gallery': MasonryGallery,
  'masonry_gallery': MasonryGallery,
  'matrix-rain': MatrixRain,
  'matrix_rain': MatrixRain,
  'morph-transition': MorphTransition,
  'morph_transition': MorphTransition,
  'noise-grain': NoiseGrain,
  'noise_grain': NoiseGrain,
  'notification-pop': NotificationPop,
  'notification_pop': NotificationPop,
  'parallax-pan': ParallaxPan,
  'parallax_pan': ParallaxPan,
  'particle-explosion': ParticleExplosion,
  'particle_explosion': ParticleExplosion,
  'photo-stack': PhotoStack,
  'photo_stack': PhotoStack,
  'picture-in-picture': PictureInPicture,
  'picture_in_picture': PictureInPicture,
  'pie-chart': PieChart,
  'pie_chart': PieChart,
  'pixel-transition': PixelTransition,
  'pixel_transition': PixelTransition,
  'polaroid-frame': PolaroidFrame,
  'polaroid_frame': PolaroidFrame,
  'popping-text': PoppingText,
  'popping_text': PoppingText,
  'progress-bars': ProgressBars,
  'progress_bars': ProgressBars,
  'progress-steps': ProgressSteps,
  'progress_steps': ProgressSteps,
  'pulsing-text': PulsingText,
  'pulsing_text': PulsingText,
  'push-transition': PushTransition,
  'push_transition': PushTransition,
  'quote-card': QuoteCard,
  'quote_card': QuoteCard,
  'rotating-carousel': RotatingCarousel,
  'rotating_carousel': RotatingCarousel,
  'slide-text': SlideText,
  'slide_text': SlideText,
  'slide-wipe': SlideWipe,
  'slide_wipe': SlideWipe,
  'sound-wave': SoundWave,
  'sound_wave': SoundWave,
  'split-screen': SplitScreen,
  'split_screen': SplitScreen,
  'spotlight-reveal': SpotlightReveal,
  'spotlight_reveal': SpotlightReveal,
  'starfield': Starfield,
  'stat-counter': StatCounter,
  'stat_counter': StatCounter,
  'subscribe-reminder': SubscribeReminder,
  'subscribe_reminder': SubscribeReminder,
  'text-highlight': TextHighlight,
  'text_highlight': TextHighlight,
  'title-split': TitleSplit,
  'title_split': TitleSplit,
  'typewriter-subtitle': TypewriterSubtitle,
  'typewriter_subtitle': TypewriterSubtitle,
  'vignette-pulse': VignettePulse,
  'vignette_pulse': VignettePulse,
  'whip-pan': WhipPan,
  'whip_pan': WhipPan,
  'zoom-pulse': ZoomPulse,
  'zoom_pulse': ZoomPulse,
  'zoom-through': ZoomThrough,
  'zoom_through': ZoomThrough,
};

export const TEMPLATE_CATALOG: OpenSourceTemplateMeta[] = [
  { id: 'animated-list', name: 'Animated List', category: 'VFX & Overlays', component: AnimatedList },
  { id: 'animated-text', name: 'Animated Text', category: 'Typography & Titles', component: AnimatedText },
  { id: 'area-chart', name: 'Area Chart', category: 'Metrics & Data', component: AreaChart },
  { id: 'blinds-transition', name: 'Blinds Transition', category: 'Transitions', component: BlindsTransition },
  { id: 'bokeh-circles', name: 'Bokeh Circles', category: 'VFX & Overlays', component: BokehCircles },
  { id: 'bounce-text', name: 'Bounce Text', category: 'Typography & Titles', component: BounceText },
  { id: 'bubble-pop-text', name: 'Bubble Pop Text', category: 'Typography & Titles', component: BubblePopText },
  { id: 'camera-shake', name: 'Camera Shake', category: 'VFX & Overlays', component: CameraShake },
  { id: 'card-flip', name: 'Card Flip', category: 'VFX & Overlays', component: CardFlip },
  { id: 'chapter-title', name: 'Chapter Title', category: 'Typography & Titles', component: ChapterTitle },
  { id: 'chart-animation', name: 'Chart Animation', category: 'Metrics & Data', component: ChartAnimation },
  { id: 'cinematic-title-intro', name: 'Cinematic Title Intro', category: 'Typography & Titles', component: CinematicTitleIntro },
  { id: 'circular-progress', name: 'Circular Progress', category: 'Metrics & Data', component: CircularProgress },
  { id: 'clock-wipe', name: 'Clock Wipe', category: 'Transitions', component: ClockWipe },
  { id: 'comparison-chart', name: 'Comparison Chart', category: 'Metrics & Data', component: ComparisonChart },
  { id: 'countdown-intro', name: 'Countdown Intro', category: 'VFX & Overlays', component: CountdownIntro },
  { id: 'countdown-timer', name: 'Countdown Timer', category: 'VFX & Overlays', component: CountdownTimer },
  { id: 'credits-roll', name: 'Credits Roll', category: 'VFX & Overlays', component: CreditsRoll },
  { id: 'cross-dissolve', name: 'Cross Dissolve', category: 'Transitions', component: CrossDissolve },
  { id: 'donut-chart', name: 'Donut Chart', category: 'Metrics & Data', component: DonutChart },
  { id: 'end-card', name: 'End Card', category: 'VFX & Overlays', component: EndCard },
  { id: 'fade-through-black', name: 'Fade Through Black', category: 'Transitions', component: FadeThroughBlack },
  { id: 'film-burn', name: 'Film Burn', category: 'VFX & Overlays', component: FilmBurn },
  { id: 'floating-bubble-text', name: 'Floating Bubble Text', category: 'Typography & Titles', component: FloatingBubbleText },
  { id: 'gallery-grid', name: 'Gallery Grid', category: 'Media & Layout', component: GalleryGrid },
  { id: 'geometric-patterns', name: 'Geometric Patterns', category: 'VFX & Overlays', component: GeometricPatterns },
  { id: 'glitch-text', name: 'Glitch Text', category: 'Typography & Titles', component: GlitchText },
  { id: 'gradient-shift', name: 'Gradient Shift', category: 'VFX & Overlays', component: GradientShift },
  { id: 'grid-pulse', name: 'Grid Pulse', category: 'VFX & Overlays', component: GridPulse },
  { id: 'image-carousel', name: 'Image Carousel', category: 'Media & Layout', component: ImageCarousel },
  { id: 'image-comparison-slider', name: 'Image Comparison Slider', category: 'Media & Layout', component: ImageComparisonSlider },
  { id: 'image-zoom-reveal', name: 'Image Zoom Reveal', category: 'Media & Layout', component: ImageZoomReveal },
  { id: 'iris-transition', name: 'Iris Transition', category: 'Transitions', component: IrisTransition },
  { id: 'ken-burns', name: 'Ken Burns', category: 'VFX & Overlays', component: KenBurns },
  { id: 'letterbox-reveal', name: 'Letterbox Reveal', category: 'VFX & Overlays', component: LetterboxReveal },
  { id: 'line-chart', name: 'Line Chart', category: 'Metrics & Data', component: LineChart },
  { id: 'liquid-wave', name: 'Liquid Wave', category: 'VFX & Overlays', component: LiquidWave },
  { id: 'logo-blur-reveal', name: 'Logo Blur Reveal', category: 'Logo Animations', component: LogoBlurReveal },
  { id: 'logo-bounce-drop', name: 'Logo Bounce Drop', category: 'Logo Animations', component: LogoBounceDrop },
  { id: 'logo-fade-reveal', name: 'Logo Fade Reveal', category: 'Transitions', component: LogoFadeReveal },
  { id: 'logo-glitch-reveal', name: 'Logo Glitch Reveal', category: 'Logo Animations', component: LogoGlitchReveal },
  { id: 'logo-scale-rotate', name: 'Logo Scale Rotate', category: 'Logo Animations', component: LogoScaleRotate },
  { id: 'logo-spin-reveal', name: 'Logo Spin Reveal', category: 'Logo Animations', component: LogoSpinReveal },
  { id: 'logo-split-reveal', name: 'Logo Split Reveal', category: 'Logo Animations', component: LogoSplitReveal },
  { id: 'logo-stroke-draw', name: 'Logo Stroke Draw', category: 'Logo Animations', component: LogoStrokeDraw },
  { id: 'logo-typewriter', name: 'Logo Typewriter', category: 'Typography & Titles', component: LogoTypewriter },
  { id: 'lower-third', name: 'Lower Third', category: 'Typography & Titles', component: LowerThird },
  { id: 'masonry-gallery', name: 'Masonry Gallery', category: 'Media & Layout', component: MasonryGallery },
  { id: 'matrix-rain', name: 'Matrix Rain', category: 'VFX & Overlays', component: MatrixRain },
  { id: 'morph-transition', name: 'Morph Transition', category: 'Transitions', component: MorphTransition },
  { id: 'noise-grain', name: 'Noise Grain', category: 'VFX & Overlays', component: NoiseGrain },
  { id: 'notification-pop', name: 'Notification Pop', category: 'VFX & Overlays', component: NotificationPop },
  { id: 'parallax-pan', name: 'Parallax Pan', category: 'VFX & Overlays', component: ParallaxPan },
  { id: 'particle-explosion', name: 'Particle Explosion', category: 'VFX & Overlays', component: ParticleExplosion },
  { id: 'photo-stack', name: 'Photo Stack', category: 'Media & Layout', component: PhotoStack },
  { id: 'picture-in-picture', name: 'Picture In Picture', category: 'VFX & Overlays', component: PictureInPicture },
  { id: 'pie-chart', name: 'Pie Chart', category: 'Metrics & Data', component: PieChart },
  { id: 'pixel-transition', name: 'Pixel Transition', category: 'Transitions', component: PixelTransition },
  { id: 'polaroid-frame', name: 'Polaroid Frame', category: 'VFX & Overlays', component: PolaroidFrame },
  { id: 'popping-text', name: 'Popping Text', category: 'Typography & Titles', component: PoppingText },
  { id: 'progress-bars', name: 'Progress Bars', category: 'Metrics & Data', component: ProgressBars },
  { id: 'progress-steps', name: 'Progress Steps', category: 'Metrics & Data', component: ProgressSteps },
  { id: 'pulsing-text', name: 'Pulsing Text', category: 'Typography & Titles', component: PulsingText },
  { id: 'push-transition', name: 'Push Transition', category: 'Transitions', component: PushTransition },
  { id: 'quote-card', name: 'Quote Card', category: 'VFX & Overlays', component: QuoteCard },
  { id: 'rotating-carousel', name: 'Rotating Carousel', category: 'Media & Layout', component: RotatingCarousel },
  { id: 'slide-text', name: 'Slide Text', category: 'Typography & Titles', component: SlideText },
  { id: 'slide-wipe', name: 'Slide Wipe', category: 'Transitions', component: SlideWipe },
  { id: 'sound-wave', name: 'Sound Wave', category: 'VFX & Overlays', component: SoundWave },
  { id: 'split-screen', name: 'Split Screen', category: 'VFX & Overlays', component: SplitScreen },
  { id: 'spotlight-reveal', name: 'Spotlight Reveal', category: 'VFX & Overlays', component: SpotlightReveal },
  { id: 'starfield', name: 'Starfield', category: 'VFX & Overlays', component: Starfield },
  { id: 'stat-counter', name: 'Stat Counter', category: 'Metrics & Data', component: StatCounter },
  { id: 'subscribe-reminder', name: 'Subscribe Reminder', category: 'VFX & Overlays', component: SubscribeReminder },
  { id: 'text-highlight', name: 'Text Highlight', category: 'Typography & Titles', component: TextHighlight },
  { id: 'title-split', name: 'Title Split', category: 'Typography & Titles', component: TitleSplit },
  { id: 'typewriter-subtitle', name: 'Typewriter Subtitle', category: 'Typography & Titles', component: TypewriterSubtitle },
  { id: 'vignette-pulse', name: 'Vignette Pulse', category: 'VFX & Overlays', component: VignettePulse },
  { id: 'whip-pan', name: 'Whip Pan', category: 'VFX & Overlays', component: WhipPan },
  { id: 'zoom-pulse', name: 'Zoom Pulse', category: 'VFX & Overlays', component: ZoomPulse },
  { id: 'zoom-through', name: 'Zoom Through', category: 'VFX & Overlays', component: ZoomThrough },
];

export function resolveOpenSourceTemplate(templateId?: string): React.ComponentType<any> | null {
  if (!templateId) return null;
  const cleaned = String(templateId).trim().toLowerCase();
  const kebab = cleaned.replace(/_/g, '-');
  const snake = cleaned.replace(/-/g, '_');
  return OPEN_SOURCE_TEMPLATES[cleaned] || OPEN_SOURCE_TEMPLATES[kebab] || OPEN_SOURCE_TEMPLATES[snake] || null;
}

export interface RemotionTemplatePlayerProps {
  templateId: string;
  frame: number;
  fps?: number;
  width?: number;
  height?: number;
  durationInFrames?: number;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Universal Remotion Template Player Component
 * Directly mounts and executes open-source Remotion animation components
 * with zero black boxes, 100% transparency, and exact frame synchronization.
 */
export function RemotionTemplatePlayer({
  templateId,
  frame,
  fps = 30,
  width = 1080,
  height = 1920,
  durationInFrames = 150,
  style,
  className,
}: RemotionTemplatePlayerProps) {
  const Component = resolveOpenSourceTemplate(templateId);

  if (!Component) {
    return null;
  }

  const clampedFrame = Math.max(0, Math.min(frame, durationInFrames - 1));

  return (
    <div
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'hidden',
        background: 'transparent',
        zIndex: 25,
        ...style,
      }}
    >
      <Thumbnail
        component={Component}
        frameToDisplay={clampedFrame}
        compositionWidth={width}
        compositionHeight={height}
        fps={fps}
        durationInFrames={durationInFrames}
        style={{
          width: '100%',
          height: '100%',
          background: 'transparent',
        }}
      />
    </div>
  );
}

export default OPEN_SOURCE_TEMPLATES;
