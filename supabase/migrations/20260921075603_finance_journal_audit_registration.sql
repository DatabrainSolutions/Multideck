-- Register the journal type before any journal lifecycle audit can be saved.
insert into public."sys_WorkflowRecordTypes"("WorkflowRecordType_Code","WorkflowRecordType_Name","WorkflowRecordType_SourceTable","WorkflowRecordType_Description")
values ('journal','General ledger journal','FIN_Journals','Manual journals and reversal drafts'),
       ('finance_posting','Finance posting','FIN_PostingBatches','Double-entry ledger batches and lines')
on conflict ("WorkflowRecordType_Code") do nothing;
