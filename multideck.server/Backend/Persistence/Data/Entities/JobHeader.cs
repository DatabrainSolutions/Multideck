using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobHeader
{
    public Guid JobId { get; set; }

    public int? JobType { get; set; }

    public int JobNumber { get; set; }

    public string JobPeriod { get; set; } = null!;

    public DateTime JobCreatedDate { get; set; }

    public Guid JobCreatedBy { get; set; }

    public DateOnly? JobRevRecognitionDate { get; set; }

    public Guid JobCustomer { get; set; }

    public Guid? JobCustomerAddress { get; set; }

    public Guid? JobShipper { get; set; }

    public Guid? JobShipperAddress { get; set; }

    public Guid? JobConsignee { get; set; }

    public Guid? JobConsigneeAddress { get; set; }

    public Guid? JobImportBroker { get; set; }

    public Guid? JobExportBroker { get; set; }

    public Guid? JobCarrier { get; set; }

    public Guid? JobSupplier { get; set; }

    public Guid JobOfficeId { get; set; }

    public Guid? JobOrgOfficeId { get; set; }

    public string JobStatus { get; set; } = null!;

    public string? JobDirection { get; set; }

    public string? JobTransportModeSummary { get; set; }

    public string? JobOriginUnlocode { get; set; }

    public string? JobOriginNameSnapshot { get; set; }

    public string? JobDestinationUnlocode { get; set; }

    public string? JobDestinationNameSnapshot { get; set; }

    public DateOnly? JobReadyDate { get; set; }

    public DateOnly? JobRequiredDeliveryDate { get; set; }

    public DateOnly? JobClosedDate { get; set; }

    public string? JobTrackingStatus { get; set; }

    public string? JobCurrentLocationUnlocode { get; set; }

    public string? JobCurrentLocationNameSnapshot { get; set; }

    public DateTime? JobLastTrackedAt { get; set; }

    public DateTime? JobPredictedDeliveryAt { get; set; }

    public decimal? JobTrackingRiskScore { get; set; }

    public string? JobInternalNotes { get; set; }

    public DateTime JobUpdatedAt { get; set; }

    public Guid? JobUpdatedBy { get; set; }

    public bool JobIsDeleted { get; set; }

    public Guid? JobLegalEntityId { get; set; }

    public Guid? JobBrandId { get; set; }

    public string? JobLegalEntityNameSnapshot { get; set; }

    public string? JobBrandNameSnapshot { get; set; }

    public virtual ICollection<AccAptransLine> AccAptransLines { get; set; } = new List<AccAptransLine>();

    public virtual ICollection<AccArtransHeader> AccArtransHeaders { get; set; } = new List<AccArtransHeader>();

    public virtual ICollection<AwbHeader> AwbHeaders { get; set; } = new List<AwbHeader>();

    public virtual ICollection<BlHeader> BlHeaders { get; set; } = new List<BlHeader>();

    public virtual ICollection<CdsDeclaration> CdsDeclarations { get; set; } = new List<CdsDeclaration>();

    public virtual ICollection<ClmClaimFinancialLink> ClmClaimFinancialLinks { get; set; } = new List<ClmClaimFinancialLink>();

    public virtual ICollection<ClmClaim> ClmClaims { get; set; } = new List<ClmClaim>();

    public virtual ICollection<ClmIncident> ClmIncidents { get; set; } = new List<ClmIncident>();

    public virtual ICollection<CrmActivity> CrmActivities { get; set; } = new List<CrmActivity>();

    public virtual ICollection<CrmActivityWorkflowRun> CrmActivityWorkflowRuns { get; set; } = new List<CrmActivityWorkflowRun>();

    public virtual ICollection<CrmAutomationRun> CrmAutomationRuns { get; set; } = new List<CrmAutomationRun>();

    public virtual ICollection<CrmCallReview> CrmCallReviews { get; set; } = new List<CrmCallReview>();

    public virtual ICollection<CrmNote> CrmNotes { get; set; } = new List<CrmNote>();

    public virtual ICollection<CrmOpportunityJobLink> CrmOpportunityJobLinks { get; set; } = new List<CrmOpportunityJobLink>();

    public virtual ICollection<CrmQuickTask> CrmQuickTasks { get; set; } = new List<CrmQuickTask>();

    public virtual ICollection<CusQuoteHeader> CusQuoteHeaders { get; set; } = new List<CusQuoteHeader>();

    public virtual ICollection<CusQuoteRevision> CusQuoteRevisions { get; set; } = new List<CusQuoteRevision>();

    public virtual ICollection<CustomsDeclaration> CustomsDeclarations { get; set; } = new List<CustomsDeclaration>();

    public virtual ICollection<DocbRenderJob> DocbRenderJobs { get; set; } = new List<DocbRenderJob>();

    public virtual ICollection<EdiMessage> EdiMessages { get; set; } = new List<EdiMessage>();

    public virtual ICollection<FinAccountingDateEvaluation> FinAccountingDateEvaluations { get; set; } = new List<FinAccountingDateEvaluation>();

    public virtual ICollection<FinAccountingEvent> FinAccountingEvents { get; set; } = new List<FinAccountingEvent>();

    public virtual ICollection<FinAccrual> FinAccruals { get; set; } = new List<FinAccrual>();

    public virtual ICollection<FinAdditionalCostRisk> FinAdditionalCostRisks { get; set; } = new List<FinAdditionalCostRisk>();

    public virtual ICollection<FinAiinsight> FinAiinsights { get; set; } = new List<FinAiinsight>();

    public virtual ICollection<FinAuthorisationRequest> FinAuthorisationRequests { get; set; } = new List<FinAuthorisationRequest>();

    public virtual ICollection<FinChargeRoeapplication> FinChargeRoeapplications { get; set; } = new List<FinChargeRoeapplication>();

    public virtual ICollection<FinCommissionItem> FinCommissionItems { get; set; } = new List<FinCommissionItem>();

    public virtual ICollection<FinCreditHold> FinCreditHolds { get; set; } = new List<FinCreditHold>();

    public virtual ICollection<FinCreditNoteImpact> FinCreditNoteImpacts { get; set; } = new List<FinCreditNoteImpact>();

    public virtual ICollection<FinCreditStopRecommendation> FinCreditStopRecommendations { get; set; } = new List<FinCreditStopRecommendation>();

    public virtual ICollection<FinCutoffRunItem> FinCutoffRunItems { get; set; } = new List<FinCutoffRunItem>();

    public virtual ICollection<FinDisruptionRiskCase> FinDisruptionRiskCases { get; set; } = new List<FinDisruptionRiskCase>();

    public virtual ICollection<FinDocumentLineJobLink> FinDocumentLineJobLinks { get; set; } = new List<FinDocumentLineJobLink>();

    public virtual ICollection<FinDocument> FinDocuments { get; set; } = new List<FinDocument>();

    public virtual ICollection<FinFxgainLossEvent> FinFxgainLossEvents { get; set; } = new List<FinFxgainLossEvent>();

    public virtual ICollection<FinJobChargeState> FinJobChargeStates { get; set; } = new List<FinJobChargeState>();

    public virtual ICollection<FinJobFinanceAutomationQueue> FinJobFinanceAutomationQueues { get; set; } = new List<FinJobFinanceAutomationQueue>();

    public virtual ICollection<FinJobFinanceException> FinJobFinanceExceptions { get; set; } = new List<FinJobFinanceException>();

    public virtual ICollection<FinJobFinanceLock> FinJobFinanceLocks { get; set; } = new List<FinJobFinanceLock>();

    public virtual ICollection<FinJobProfitSnapshot> FinJobProfitSnapshots { get; set; } = new List<FinJobProfitSnapshot>();

    public virtual ICollection<FinJobRoeset> FinJobRoesets { get; set; } = new List<FinJobRoeset>();

    public virtual ICollection<FinPeriodAdjustment> FinPeriodAdjustments { get; set; } = new List<FinPeriodAdjustment>();

    public virtual ICollection<FinPeriodCloseRunItem> FinPeriodCloseRunItems { get; set; } = new List<FinPeriodCloseRunItem>();

    public virtual ICollection<FinProfitShareItem> FinProfitShareItems { get; set; } = new List<FinProfitShareItem>();

    public virtual ICollection<FinVarianceCase> FinVarianceCases { get; set; } = new List<FinVarianceCase>();

    public virtual ICollection<FinVesselRoeset> FinVesselRoesets { get; set; } = new List<FinVesselRoeset>();

    public virtual ICollection<FinWipitem> FinWipitems { get; set; } = new List<FinWipitem>();

    public virtual CmpBrand? JobBrand { get; set; }

    public virtual ICollection<JobCargo> JobCargos { get; set; } = new List<JobCargo>();

    public virtual ICollection<JobContainer> JobContainers { get; set; } = new List<JobContainer>();

    public virtual ICollection<JobCostingChargesIn> JobCostingChargesIns { get; set; } = new List<JobCostingChargesIn>();

    public virtual ICollection<JobCostingChargesOut> JobCostingChargesOuts { get; set; } = new List<JobCostingChargesOut>();

    public virtual SysJobDirection? JobDirectionNavigation { get; set; }

    public virtual ICollection<JobDocument> JobDocuments { get; set; } = new List<JobDocument>();

    public virtual ICollection<JobKpiresult> JobKpiresults { get; set; } = new List<JobKpiresult>();

    public virtual CmpLegalEntity? JobLegalEntity { get; set; }

    public virtual ICollection<JobLocation> JobLocations { get; set; } = new List<JobLocation>();

    public virtual CmpOffice? JobOrgOffice { get; set; }

    public virtual ICollection<JobParty> JobParties { get; set; } = new List<JobParty>();

    public virtual ICollection<JobReference> JobReferences { get; set; } = new List<JobReference>();

    public virtual ICollection<JobRouting> JobRoutings { get; set; } = new List<JobRouting>();

    public virtual SysJobStatus JobStatusNavigation { get; set; } = null!;

    public virtual ICollection<JobTrackingEvent> JobTrackingEvents { get; set; } = new List<JobTrackingEvent>();

    public virtual ICollection<JobTrackingException> JobTrackingExceptions { get; set; } = new List<JobTrackingException>();

    public virtual ICollection<JobTrackingPrediction> JobTrackingPredictions { get; set; } = new List<JobTrackingPrediction>();

    public virtual ICollection<JobTrackingSubscription> JobTrackingSubscriptions { get; set; } = new List<JobTrackingSubscription>();

    public virtual SysJobTransportMode? JobTransportModeSummaryNavigation { get; set; }

    public virtual ICollection<MdxSharedJob> MdxSharedJobs { get; set; } = new List<MdxSharedJob>();

    public virtual ICollection<PortalActionRequest> PortalActionRequests { get; set; } = new List<PortalActionRequest>();

    public virtual ICollection<PortalFileUpload> PortalFileUploads { get; set; } = new List<PortalFileUpload>();

    public virtual ICollection<PortalRecordShare> PortalRecordShares { get; set; } = new List<PortalRecordShare>();

    public virtual ICollection<RateJobCostingLink> RateJobCostingLinks { get; set; } = new List<RateJobCostingLink>();

    public virtual ICollection<RateRateRequest> RateRateRequests { get; set; } = new List<RateRateRequest>();

    public virtual ICollection<T1Declaration> T1Declarations { get; set; } = new List<T1Declaration>();

    public virtual ICollection<TceAuditEvent> TceAuditEvents { get; set; } = new List<TceAuditEvent>();

    public virtual ICollection<TceComplianceCase> TceComplianceCases { get; set; } = new List<TceComplianceCase>();

    public virtual ICollection<TceComplianceCheckItem> TceComplianceCheckItems { get; set; } = new List<TceComplianceCheckItem>();

    public virtual ICollection<TceComplianceChecklist> TceComplianceChecklists { get; set; } = new List<TceComplianceChecklist>();

    public virtual ICollection<TceComplianceHold> TceComplianceHolds { get; set; } = new List<TceComplianceHold>();

    public virtual ICollection<TceHsclassification> TceHsclassifications { get; set; } = new List<TceHsclassification>();

    public virtual ICollection<TceIntegrationEvent> TceIntegrationEvents { get; set; } = new List<TceIntegrationEvent>();

    public virtual ICollection<TceLicenseUsage> TceLicenseUsages { get; set; } = new List<TceLicenseUsage>();

    public virtual ICollection<TceOriginDeclaration> TceOriginDeclarations { get; set; } = new List<TceOriginDeclaration>();

    public virtual ICollection<TcePreferenceClaim> TcePreferenceClaims { get; set; } = new List<TcePreferenceClaim>();

    public virtual ICollection<TceRecordLink> TceRecordLinks { get; set; } = new List<TceRecordLink>();

    public virtual ICollection<TceReleaseGate> TceReleaseGates { get; set; } = new List<TceReleaseGate>();

    public virtual ICollection<TceScreeningRun> TceScreeningRuns { get; set; } = new List<TceScreeningRun>();

    public virtual ICollection<WmsAdjustment> WmsAdjustments { get; set; } = new List<WmsAdjustment>();

    public virtual ICollection<WmsAiinsight> WmsAiinsights { get; set; } = new List<WmsAiinsight>();

    public virtual ICollection<WmsAppointmentSlot> WmsAppointmentSlots { get; set; } = new List<WmsAppointmentSlot>();

    public virtual ICollection<WmsBillingEvent> WmsBillingEvents { get; set; } = new List<WmsBillingEvent>();

    public virtual ICollection<WmsBondedEntry> WmsBondedEntries { get; set; } = new List<WmsBondedEntry>();

    public virtual ICollection<WmsBondedRemoval> WmsBondedRemovals { get; set; } = new List<WmsBondedRemoval>();

    public virtual ICollection<WmsDispatch> WmsDispatches { get; set; } = new List<WmsDispatch>();

    public virtual ICollection<WmsDocument> WmsDocuments { get; set; } = new List<WmsDocument>();

    public virtual ICollection<WmsException> WmsExceptions { get; set; } = new List<WmsException>();

    public virtual ICollection<WmsHandlingUnitEvent> WmsHandlingUnitEvents { get; set; } = new List<WmsHandlingUnitEvent>();

    public virtual ICollection<WmsHandlingUnit> WmsHandlingUnits { get; set; } = new List<WmsHandlingUnit>();

    public virtual ICollection<WmsInboundAdvice> WmsInboundAdvices { get; set; } = new List<WmsInboundAdvice>();

    public virtual ICollection<WmsIntegrationEvent> WmsIntegrationEvents { get; set; } = new List<WmsIntegrationEvent>();

    public virtual ICollection<WmsInventoryHold> WmsInventoryHolds { get; set; } = new List<WmsInventoryHold>();

    public virtual ICollection<WmsInventoryTransaction> WmsInventoryTransactions { get; set; } = new List<WmsInventoryTransaction>();

    public virtual ICollection<WmsOrder> WmsOrders { get; set; } = new List<WmsOrder>();

    public virtual ICollection<WmsPhotoEvidence> WmsPhotoEvidences { get; set; } = new List<WmsPhotoEvidence>();

    public virtual ICollection<WmsReceipt> WmsReceipts { get; set; } = new List<WmsReceipt>();

    public virtual ICollection<WmsTask> WmsTasks { get; set; } = new List<WmsTask>();
}
