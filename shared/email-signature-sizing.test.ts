import assert from 'node:assert/strict';
import {newSignatureDocument,newSignatureBlock,signatureColumnWidths,resizeSignatureColumn,resizeSignatureImage,validateSignatureDocument,renderSignature,signatureNeedsPersonPhoto,signaturePersonPhotoKey} from './email-signatures.ts';
Deno.test('column proportions survive validation, remain bounded, and render independently per row',()=>{
 const doc=newSignatureDocument();
 doc.rows.push({id:'second',columns:[[],[]],columnWidths:[65,35]});
 const resized=validateSignatureDocument(resizeSignatureColumn(doc,doc.rows[0].id,30));
 assert.deepEqual(resized.rows[0].columnWidths,[30,70]);
 assert.deepEqual(signatureColumnWidths(resized.rows[1]),[65,35]);
 assert.deepEqual(signatureColumnWidths({...doc.rows[0],columnWidths:[NaN,0]}),[50,50]);
 assert.deepEqual(signatureColumnWidths({...doc.rows[0],columnWidths:[99,1]}),[80,20]);
 const html=renderSignature(resized,{name:'Test',jobTitle:'',email:'',phone:'',mobile:'',company:'',website:'',address:''}).html;
 assert.match(html,/width="30%"/);assert.match(html,/width="65%"/);assert.match(html,/table-layout:fixed/);
 assert.equal(doc.rows[0].columnWidths,undefined);
});
Deno.test('enlarging an image expands its column without exceeding available width or mutating input',()=>{
 const doc=newSignatureDocument();const image=doc.rows[0].columns[0][0];
 const resized=resizeSignatureImage(doc,image.id,320);
 assert.equal(resized.rows[0].columns[0][0].width,320);
 assert.deepEqual(signatureColumnWidths(resized.rows[0]),[70,30]);
 assert.equal(image.width,120);
 const limited=resizeSignatureImage(doc,image.id,1000);
 assert.equal(limited.rows[0].columns[0][0].width,368);
 assert.deepEqual(signatureColumnWidths(limited.rows[0]),[80,20]);
 const smaller=resizeSignatureImage(resized,image.id,80);
 assert.deepEqual(signatureColumnWidths(smaller.rows[0]),[70,30]);
});

const blockValues={name:'Alex <Morgan>',jobTitle:'Operations',email:'alex@example.test',phone:'+44 (0)20 7946 0123',mobile:'',company:'Example',website:'https://example.test/',address:'1 Dock Road\nLondon'};
Deno.test('legacy documents keep their shape and output when no new options are used',()=>{
 const doc=newSignatureDocument('side');
 const saved=validateSignatureDocument(JSON.parse(JSON.stringify(doc)));
 for(const key of ['font','padding','radius','accent']) assert.equal(key in saved,false);
 for(const block of saved.rows[0].columns.flat()) for(const key of ['fill','italic','caps','radius','fields','links','variant']) assert.equal(key in block,false);
 assert.match(renderSignature(saved,blockValues).html,/font-family:Arial,Helvetica,sans-serif;border-collapse:collapse/);
});
Deno.test('contact list resolves labelled links, omits blanks and joins inline',()=>{
 const doc=newSignatureDocument('stacked');const block={...newSignatureBlock('details'),fields:['phone','mobile','email','website','address'] as const};
 doc.rows[0].columns=[[{...block,fields:[...block.fields]}]];
 const stacked=renderSignature(validateSignatureDocument(doc),blockValues);
 assert.match(stacked.html,/href="tel:\+4402079460123"/);assert.match(stacked.html,/mailto:alex@example.test/);assert.match(stacked.html,/>example.test</);
 assert.ok(!stacked.text.includes('M '));assert.match(stacked.text,/^T \+44/);assert.match(stacked.html,/1 Dock Road<br>London/);
 doc.rows[0].columns[0][0].layout='inline';doc.rows[0].columns[0][0].labels='none';
 const inline=renderSignature(validateSignatureDocument(doc),blockValues);
 assert.match(inline.text,/\| alex@example.test \|/);assert.match(inline.html,/1 Dock Road · London/);
});
Deno.test('buttons and social profiles render email-safe tables and reject unsafe links',()=>{
 const button={...newSignatureBlock('button'),href:'https://example.test/book',text:'Book <now>'};
 const socials={...newSignatureBlock('socials'),links:[{network:'linkedin' as const,href:'https://linkedin.com/in/alex'},{network:'x' as const,href:''}]};
 const doc={version:1 as const,width:480,colour:'#ffffff',font:'georgia' as const,padding:16,radius:8,rows:[{id:'row-one',valign:'middle' as const,rule:'#dddddd',columns:[[button],[socials]]}]};
 const saved=validateSignatureDocument(JSON.parse(JSON.stringify(doc)));
 assert.equal(saved.font,'georgia');assert.equal(saved.rows[0].valign,'middle');assert.equal(saved.rows[0].rule,'#dddddd');
 const out=renderSignature(saved,blockValues);
 assert.match(out.html,/bgcolor="#0e7d74"/);assert.match(out.html,/Book &lt;now&gt;/);assert.match(out.html,/href="https:\/\/linkedin.com\/in\/alex"/);
 assert.equal((out.html.match(/title="/g)||[]).length,1);assert.match(out.html,/Georgia/);assert.match(out.html,/padding:16px/);assert.match(out.html,/border-left:1px solid #dddddd/);assert.match(out.html,/vertical-align:middle/);
 assert.match(out.text,/Book <now>: https:\/\/example.test\/book/);assert.match(out.text,/LinkedIn: https/);
 assert.throws(()=>validateSignatureDocument({...doc,rows:[{...doc.rows[0],columns:[[{...socials,links:[{network:'linkedin',href:'javascript:alert(1)'}]}]]}]}),/HTTPS/);
 assert.throws(()=>validateSignatureDocument({...doc,rows:[{...doc.rows[0],columns:[[{...socials,links:[{network:'myspace',href:''}]}]]}]}),/supported/);
 assert.throws(()=>validateSignatureDocument({...doc,rows:[{...doc.rows[0],columns:[[{...socials,links:Array(9).fill(socials.links[0])}]]}]}),/eight/);
});
Deno.test('padding narrows image limits so content never exceeds the signature width',()=>{
 const doc={...newSignatureDocument('stacked'),padding:20};const image=newSignatureBlock('image');doc.rows[0].columns[0].push(image);
 assert.equal(resizeSignatureImage(doc,image.id,1000).rows[0].columns[0].at(-1)!.width,440);
});
Deno.test('headshots render each person\'s own photo, falling back to the upload',()=>{
 const doc=newSignatureDocument();
 const photo={...newSignatureBlock('image'),imageRole:'photo' as const,width:72,radius:999,assetId:'00000000-0000-4000-8000-000000000001'};
 doc.rows[0].columns[0]=[photo];
 const saved=validateSignatureDocument(doc);
 assert.equal(signatureNeedsPersonPhoto(saved),true);
 const values={name:'Alex Morgan',jobTitle:'',email:'',phone:'',mobile:'',company:'',website:'',address:''};
 const own=renderSignature(saved,values,{[signaturePersonPhotoKey]:'https://photos.example/alex.jpg',[photo.assetId]:'https://assets.example/fallback.png'}).html;
 assert.match(own,/alex\.jpg" alt="Alex Morgan" width="72" height="72"/);
 assert.match(renderSignature(saved,values,{[photo.assetId]:'https://assets.example/fallback.png'}).html,/fallback\.png/);
 const shared=validateSignatureDocument({...saved,rows:[{...saved.rows[0],columns:[[{...photo,imageSource:'upload'}],[]]}]});
 assert.doesNotMatch(renderSignature(shared,values,{[signaturePersonPhotoKey]:'https://photos.example/alex.jpg',[photo.assetId]:'https://assets.example/fallback.png'}).html,/alex\.jpg/);
});
Deno.test('unsupported blocks are not reported as a block-count limit',()=>{
 const doc=newSignatureDocument();
 doc.rows[0].columns[0]=[{...newSignatureBlock('text'),kind:'unknown' as never}];
 assert.throws(()=>validateSignatureDocument(doc),/can't be saved yet/);
 const supported=newSignatureDocument('stacked');
 supported.rows[0].columns[0]=(['details','socials','button'] as const).map(kind=>newSignatureBlock(kind));
 assert.equal(validateSignatureDocument(supported).rows[0].columns[0].length,3);
 supported.rows[0].columns[0]=Array.from({length:60},()=>newSignatureBlock('text'));
 assert.equal(validateSignatureDocument(supported).rows[0].columns[0].length,60);
 supported.rows[0].columns[0].push(newSignatureBlock('text'));
 assert.throws(()=>validateSignatureDocument(supported),/up to 60 blocks/);
});
