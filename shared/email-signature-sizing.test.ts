import assert from 'node:assert/strict';
import {newSignatureDocument,signatureColumnWidths,resizeSignatureColumn,resizeSignatureImage,validateSignatureDocument,renderSignature} from './email-signatures.ts';
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
