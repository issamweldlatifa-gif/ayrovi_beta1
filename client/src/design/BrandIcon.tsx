import React from 'react';
import { FcGoogle } from 'react-icons/fc';
import { FaApple, FaFacebookF, FaInstagram, FaTiktok, FaWhatsapp } from 'react-icons/fa6';
import type { IconBaseProps } from 'react-icons';

/** Authentic third-party marks are brands, not alternative interface icon families. */
const marks = { google: FcGoogle, apple: FaApple, facebook: FaFacebookF, instagram: FaInstagram, tiktok: FaTiktok, whatsapp: FaWhatsapp };
export type BrandName = keyof typeof marks;
export function BrandIcon({ name, ...props }: IconBaseProps & { name: BrandName }) {
  const Mark = marks[name];
  const labelled = props.title || props['aria-label'] || props['aria-labelledby'];
  return <Mark {...props} data-brand-icon={name} aria-hidden={labelled ? undefined : true} role={labelled ? 'img' : undefined} focusable="false" />;
}
export const GoogleBrandIcon = (props: IconBaseProps) => <BrandIcon {...props} name="google" />;
export const AppleBrandIcon = (props: IconBaseProps) => <BrandIcon {...props} name="apple" />;
export const FacebookBrandIcon = (props: IconBaseProps) => <BrandIcon {...props} name="facebook" />;
export const InstagramBrandIcon = (props: IconBaseProps) => <BrandIcon {...props} name="instagram" />;
export const TiktokBrandIcon = (props: IconBaseProps) => <BrandIcon {...props} name="tiktok" />;
export const WhatsappBrandIcon = (props: IconBaseProps) => <BrandIcon {...props} name="whatsapp" />;
