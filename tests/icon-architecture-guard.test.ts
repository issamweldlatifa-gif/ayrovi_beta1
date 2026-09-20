import { describe, it, expect } from 'vitest';
import { checkIconContract, inspectIconSource } from '../scripts/check-icon-contract.mjs';

const file='client/src/components/RegressionExample.tsx';
describe('whole-application icon architecture gate',()=>{
  it('audits the actual application, including admin, with zero unreviewed exceptions',()=>{
    const report=checkIconContract();
    expect(report.files).toBeGreaterThan(150);
    expect(report.rawSvg).toBe(4);
    expect(report.issues).toEqual([]);
  });
  it.each([
    'const x=<svg><path d="M1 2h3"/></svg>;',
    'const x=<path d="M1 2h3"/>;',
    'const x=React.createElement("svg",{});',
    'const x=document.createElementNS("http://www.w3.org/2000/svg","svg");',
    'import {User} from "lucide-react";',
    'import {FaUser} from "react-icons/fa6";',
    'const x=<IconFamily family="legacy"><User/></IconFamily>;',
    'const x=<User strokeWidth={2}/>;',
    'const x=<User style={{strokeWidth:2}}/>;',
    'const x=<User className="stroke-[2.5]"/>;',
    'const x=<span className="animate-spin border-2 border-t-transparent"/>;',
    'const x=<button>✓ Valider</button>;',
    'const x={label:"Caméra 📷"};',
    'const x=createAyroviIcon("User",<path/>);',
  ])('rejects a bypass: %s',source=>expect(inspectIconSource(file,source).issues.length).toBeGreaterThan(0));
  it('allows the canonical renderer, genuine typography, and regular business text',()=>{
    const source='import {User} from "./QatafoIcons"; const x=<User size={24} aria-label="Compte"/>; const y="© AYROVI · N° 3 · 360° · Paramètres → Compte"; // ✓ comment, not an icon';
    expect(inspectIconSource(file,source).issues).toEqual([]);
  });
  it('cannot disguise an interface drawing as a new brand exception',()=>{
    expect(inspectIconSource(file,'const x=<svg data-brand-mark="invented"/>;').issues.length).toBeGreaterThan(0);
  });
  it('does not permit extra SVG roots in an approved visualization file',()=>{
    const report=inspectIconSource('client/src/components/assistant/VoiceLevel.tsx','const x=<><svg data-visualization="audio-level"/><svg data-visualization="audio-level"/></>;');
    expect(report.issues.some(i=>i.reason.includes('exactly'))).toBe(true);
  });
  it('brand registry cannot become a generic external icon library',()=>{
    expect(inspectIconSource('client/src/design/BrandIcon.tsx','import {FaUser} from "react-icons/fa6";').issues.length).toBeGreaterThan(0);
  });
});
