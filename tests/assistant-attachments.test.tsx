// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
const { prepare } = vi.hoisted(()=>({prepare:vi.fn()}));
vi.mock('../client/src/components/assistant/media/prepareImage',()=>({prepareAssistantImage:prepare,ImagePreparationError:class extends Error{code='unreadable';}}));
import { useAssistantAttachments } from '../client/src/components/assistant/media/useAssistantAttachments';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,container:HTMLDivElement,api:ReturnType<typeof useAssistantAttachments>,errors:Mock;
const waiting: Array<{resolve:(value:any)=>void; reject:(error:unknown)=>void;signal:AbortSignal}>=[];
function Fixture({scope}:{scope:string}) { api=useAssistantAttachments(scope,errors);return <div>{api.attachments.map(item=>item.name).join(',')}:{api.pending}</div>; }
beforeEach(()=>{waiting.length=0;errors=vi.fn();prepare.mockReset().mockImplementation((_file,signal)=>new Promise((resolve,reject)=>waiting.push({resolve,reject,signal})));container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const render=async(scope='accountA/threadA')=>act(async()=>root.render(<Fixture scope={scope}/>));
function add(name:string) { let result!:Promise<boolean>;act(()=>{result=api.add(new File(['x'],name,{type:'image/png'}));});return result; }
async function complete(index:number) { await act(async()=>waiting[index].resolve({preview:'data:image/png;base64,eA==',type:'image/png'})); }
describe('attachment reservations and scope ownership',()=>{
  it('reserves two slots before either asynchronous preparation finishes',async()=>{await render();add('first');add('second');expect(await add('third')).toBe(false);expect(prepare).toHaveBeenCalledTimes(2);expect(errors).toHaveBeenCalledWith('limit');expect(api.pending).toBe(2);});
  it('retains selection order when the second image finishes first',async()=>{await render();add('first');add('second');await complete(1);await complete(0);expect(api.getReady().map(x=>x.name)).toEqual(['first','second']);expect(api.pending).toBe(0);});
  for(const scope of ['accountA/threadB','accountB/threadA','closed']) it(`discards completion across ${scope}`,async()=>{await render();const result=add('old');await render(scope);expect(waiting[0].signal.aborted).toBe(true);await complete(0);expect(await result).toBe(false);expect(api.attachments).toEqual([]);expect(errors).not.toHaveBeenCalled();});
  it('cancellation preserves ready images and permits a fresh reservation',async()=>{await render();add('ready');await complete(0);const old=add('cancelled');act(()=>api.cancelPending());add('replacement');await complete(1);await complete(2);expect(await old).toBe(false);expect(api.getReady().map(x=>x.name)).toEqual(['ready','replacement']);});
  it('an old finally cannot clear a new pending operation',async()=>{await render();add('old');act(()=>api.clear());add('new');await complete(0);expect(api.pending).toBe(1);await complete(1);expect(api.pending).toBe(0);});
  it('failure frees its reserved slot and does not create a fake attachment',async()=>{await render();add('bad');await act(async()=>waiting[0].reject(new Error('decode failed')));expect(api.attachments).toEqual([]);expect(api.pending).toBe(0);expect(errors).toHaveBeenCalledWith('unreadable');add('retry');await complete(1);expect(api.attachments).toHaveLength(1);});
  it('unmount aborts ownership and suppresses late errors',async()=>{await render();const result=add('old');await act(async()=>root.unmount());expect(waiting[0].signal.aborted).toBe(true);await act(async()=>waiting[0].reject(new Error('late')));expect(await result).toBe(false);expect(errors).not.toHaveBeenCalled();root=createRoot(container);});
});
