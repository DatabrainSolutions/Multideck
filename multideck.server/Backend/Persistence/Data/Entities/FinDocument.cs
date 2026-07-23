using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinDocument
{
    public Guid FindocId { get; set; }

    public string FindocTypeCode { get; set; } = null!;

    public string FindocStatusCode { get; set; } = null!;

    public string? FindocNumber { get; set; }

    public Guid? FindocLegalEntityId { get; set; }

    public Guid? FindocOrgOfficeId { get; set; }

    public Guid? FindocBrandId { get; set; }

    public Guid? FindocPartyOrgId { get; set; }

    public string FindocPartyRole { get; set; } = null!;

    public DateOnly FindocDocumentDate { get; set; }

    public DateOnly FindocAccountingDate { get; set; }

    public DateOnly? FindocSourceAccountingDate { get; set; }

    public DateOnly? FindocDueDate { get; set; }

    public Guid? FindocPeriodId { get; set; }

    public string FindocCurrencyCodeSnapshot { get; set; } = null!;

    public decimal FindocExchangeRate { get; set; }

    public Guid? FindocExchangeRateId { get; set; }

    public decimal FindocNetAmount { get; set; }

    public decimal FindocTaxAmount { get; set; }

    public decimal FindocGrossAmount { get; set; }

    public decimal FindocLocalNetAmount { get; set; }

    public decimal FindocLocalTaxAmount { get; set; }

    public decimal FindocLocalGrossAmount { get; set; }

    public decimal FindocOutstandingAmount { get; set; }

    public decimal FindocLocalOutstandingAmount { get; set; }

    public Guid? FindocSourceJobId { get; set; }

    public string? FindocSourceTable { get; set; }

    public Guid? FindocSourceId { get; set; }

    public string FindocPostingStatusCode { get; set; } = null!;

    public string FindocExportStatusCode { get; set; } = null!;

    public DateTime? FindocPostedAt { get; set; }

    public Guid? FindocPostedBy { get; set; }

    public Guid? FindocExportBatchId { get; set; }

    public bool FindocIsLocked { get; set; }

    public string FindocMetadataJson { get; set; } = null!;

    public DateTime FindocCreatedAt { get; set; }

    public Guid? FindocCreatedBy { get; set; }

    public DateTime FindocUpdatedAt { get; set; }

    public Guid? FindocUpdatedBy { get; set; }

    public virtual ICollection<ClmClaimFinancialLink> ClmClaimFinancialLinks { get; set; } = new List<ClmClaimFinancialLink>();

    public virtual ICollection<ClmClaimRecovery> ClmClaimRecoveries { get; set; } = new List<ClmClaimRecovery>();

    public virtual ICollection<EdiMessage> EdiMessages { get; set; } = new List<EdiMessage>();

    public virtual ICollection<FinAccountingDateEvaluation> FinAccountingDateEvaluations { get; set; } = new List<FinAccountingDateEvaluation>();

    public virtual ICollection<FinAdditionalCostRisk> FinAdditionalCostRisks { get; set; } = new List<FinAdditionalCostRisk>();

    public virtual ICollection<FinAiinsight> FinAiinsights { get; set; } = new List<FinAiinsight>();

    public virtual ICollection<FinCashAllocation> FinCashAllocations { get; set; } = new List<FinCashAllocation>();

    public virtual ICollection<FinCommissionItem> FinCommissionItems { get; set; } = new List<FinCommissionItem>();

    public virtual ICollection<FinCreditHold> FinCreditHolds { get; set; } = new List<FinCreditHold>();

    public virtual ICollection<FinCreditNoteLink> FinCreditNoteLinkFincreditLinkCreditDocuments { get; set; } = new List<FinCreditNoteLink>();

    public virtual ICollection<FinCreditNoteLink> FinCreditNoteLinkFincreditLinkOriginalDocuments { get; set; } = new List<FinCreditNoteLink>();

    public virtual ICollection<FinCreditNoteRequest> FinCreditNoteRequestFincnrqResultCreditDocuments { get; set; } = new List<FinCreditNoteRequest>();

    public virtual ICollection<FinCreditNoteRequest> FinCreditNoteRequestFincnrqSourceDocuments { get; set; } = new List<FinCreditNoteRequest>();

    public virtual ICollection<FinCutoffRunItem> FinCutoffRunItems { get; set; } = new List<FinCutoffRunItem>();

    public virtual ICollection<FinDebtCase> FinDebtCases { get; set; } = new List<FinDebtCase>();

    public virtual ICollection<FinDocumentApproval> FinDocumentApprovals { get; set; } = new List<FinDocumentApproval>();

    public virtual ICollection<FinDocumentDispute> FinDocumentDisputes { get; set; } = new List<FinDocumentDispute>();

    public virtual ICollection<FinDocumentFile> FinDocumentFiles { get; set; } = new List<FinDocumentFile>();

    public virtual ICollection<FinDocumentLineJobLink> FinDocumentLineJobLinks { get; set; } = new List<FinDocumentLineJobLink>();

    public virtual ICollection<FinDocumentLine> FinDocumentLines { get; set; } = new List<FinDocumentLine>();

    public virtual ICollection<FinDocumentReference> FinDocumentReferences { get; set; } = new List<FinDocumentReference>();

    public virtual ICollection<FinDocumentStatusHistory> FinDocumentStatusHistories { get; set; } = new List<FinDocumentStatusHistory>();

    public virtual ICollection<FinDocumentTaxis> FinDocumentTaxes { get; set; } = new List<FinDocumentTaxis>();

    public virtual ICollection<FinDunningItem> FinDunningItems { get; set; } = new List<FinDunningItem>();

    public virtual ICollection<FinFxgainLossEvent> FinFxgainLossEvents { get; set; } = new List<FinFxgainLossEvent>();

    public virtual ICollection<FinIntegrationQueue> FinIntegrationQueues { get; set; } = new List<FinIntegrationQueue>();

    public virtual ICollection<FinJobChargeAllocation> FinJobChargeAllocations { get; set; } = new List<FinJobChargeAllocation>();

    public virtual ICollection<FinJobChargeState> FinJobChargeStates { get; set; } = new List<FinJobChargeState>();

    public virtual ICollection<FinPaymentRunItem> FinPaymentRunItems { get; set; } = new List<FinPaymentRunItem>();

    public virtual ICollection<FinPostingLine> FinPostingLines { get; set; } = new List<FinPostingLine>();

    public virtual ICollection<FinProfitShareSettlement> FinProfitShareSettlements { get; set; } = new List<FinProfitShareSettlement>();

    public virtual ICollection<FinRevaluationItem> FinRevaluationItems { get; set; } = new List<FinRevaluationItem>();

    public virtual ICollection<FinVarianceCase> FinVarianceCases { get; set; } = new List<FinVarianceCase>();

    public virtual CmpBrand? FindocBrand { get; set; }

    public virtual CmpUser? FindocCreatedByNavigation { get; set; }

    public virtual FinExchangeRate? FindocExchangeRateNavigation { get; set; }

    public virtual AcciExportBatch? FindocExportBatch { get; set; }

    public virtual CmpLegalEntity? FindocLegalEntity { get; set; }

    public virtual CmpOffice? FindocOrgOffice { get; set; }

    public virtual OrgMaster? FindocPartyOrg { get; set; }

    public virtual FinPeriod? FindocPeriod { get; set; }

    public virtual CmpUser? FindocPostedByNavigation { get; set; }

    public virtual SysFinancePostingStatus FindocPostingStatusCodeNavigation { get; set; } = null!;

    public virtual JobHeader? FindocSourceJob { get; set; }

    public virtual SysFinanceDocumentStatus FindocStatusCodeNavigation { get; set; } = null!;

    public virtual SysFinanceDocumentType FindocTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? FindocUpdatedByNavigation { get; set; }
}
