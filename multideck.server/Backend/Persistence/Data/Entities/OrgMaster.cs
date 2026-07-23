using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class OrgMaster
{
    public Guid OrgId { get; set; }

    public string OrgName { get; set; } = null!;

    public Guid? OrgBaseCurrency { get; set; }

    public string? OrgCrmrelationshipStatusCode { get; set; }

    public bool OrgCrmisLead { get; set; }

    public bool OrgCrmisPotentialCustomer { get; set; }

    public DateTime OrgCrmupdatedAt { get; set; }

    public virtual ICollection<AccAptransHeader> AccAptransHeaders { get; set; } = new List<AccAptransHeader>();

    public virtual ICollection<AcciPartyMapping> AcciPartyMappings { get; set; } = new List<AcciPartyMapping>();

    public virtual ICollection<ClmClaim> ClmClaimClmclaimAdjusterOrgs { get; set; } = new List<ClmClaim>();

    public virtual ICollection<ClmClaim> ClmClaimClmclaimBrokerOrgs { get; set; } = new List<ClmClaim>();

    public virtual ICollection<ClmClaim> ClmClaimClmclaimClaimantOrgs { get; set; } = new List<ClmClaim>();

    public virtual ICollection<ClmClaim> ClmClaimClmclaimCustomerOrgs { get; set; } = new List<ClmClaim>();

    public virtual ICollection<ClmClaim> ClmClaimClmclaimInsurerOrgs { get; set; } = new List<ClmClaim>();

    public virtual ICollection<ClmClaim> ClmClaimClmclaimRespondentOrgs { get; set; } = new List<ClmClaim>();

    public virtual ICollection<ClmClaim> ClmClaimClmclaimSurveyorOrgs { get; set; } = new List<ClmClaim>();

    public virtual ICollection<ClmClaimParty> ClmClaimParties { get; set; } = new List<ClmClaimParty>();

    public virtual ICollection<ClmClaimRecovery> ClmClaimRecoveries { get; set; } = new List<ClmClaimRecovery>();

    public virtual ICollection<ClmIncidentParty> ClmIncidentParties { get; set; } = new List<ClmIncidentParty>();

    public virtual ICollection<ClmIncident> ClmIncidents { get; set; } = new List<ClmIncident>();

    public virtual ICollection<ClmInsuranceNotification> ClmInsuranceNotifications { get; set; } = new List<ClmInsuranceNotification>();

    public virtual ICollection<ClmInsurancePolicy> ClmInsurancePolicyClmpolicyBrokerOrgs { get; set; } = new List<ClmInsurancePolicy>();

    public virtual ICollection<ClmInsurancePolicy> ClmInsurancePolicyClmpolicyInsuredOrgs { get; set; } = new List<ClmInsurancePolicy>();

    public virtual ICollection<ClmInsurancePolicy> ClmInsurancePolicyClmpolicyInsurerOrgs { get; set; } = new List<ClmInsurancePolicy>();

    public virtual ICollection<ClmPolicyParty> ClmPolicyParties { get; set; } = new List<ClmPolicyParty>();

    public virtual ICollection<ClmSurveyAppointment> ClmSurveyAppointments { get; set; } = new List<ClmSurveyAppointment>();

    public virtual ICollection<CommAiautomationPolicy> CommAiautomationPolicies { get; set; } = new List<CommAiautomationPolicy>();

    public virtual ICollection<CommConsentPreference> CommConsentPreferences { get; set; } = new List<CommConsentPreference>();

    public virtual ICollection<CommFederationPeer> CommFederationPeers { get; set; } = new List<CommFederationPeer>();

    public virtual ICollection<CommIdentity> CommIdentities { get; set; } = new List<CommIdentity>();

    public virtual ICollection<CommMessageRecipient> CommMessageRecipients { get; set; } = new List<CommMessageRecipient>();

    public virtual ICollection<CommMessageTemplate> CommMessageTemplates { get; set; } = new List<CommMessageTemplate>();

    public virtual ICollection<CommSendRequestRecipient> CommSendRequestRecipients { get; set; } = new List<CommSendRequestRecipient>();

    public virtual ICollection<CommThreadParticipant> CommThreadParticipants { get; set; } = new List<CommThreadParticipant>();

    public virtual ICollection<CommThread> CommThreads { get; set; } = new List<CommThread>();

    public virtual CrmAccountProfile? CrmAccountProfile { get; set; }

    public virtual ICollection<CrmActivityParticipant> CrmActivityParticipants { get; set; } = new List<CrmActivityParticipant>();

    public virtual ICollection<CrmActivityWorkflowRule> CrmActivityWorkflowRules { get; set; } = new List<CrmActivityWorkflowRule>();

    public virtual ICollection<CrmActivityWorkflowRun> CrmActivityWorkflowRuns { get; set; } = new List<CrmActivityWorkflowRun>();

    public virtual ICollection<CrmAutomationPlaybook> CrmAutomationPlaybooks { get; set; } = new List<CrmAutomationPlaybook>();

    public virtual ICollection<CrmAutomationRun> CrmAutomationRuns { get; set; } = new List<CrmAutomationRun>();

    public virtual ICollection<CrmCampaignMember> CrmCampaignMembers { get; set; } = new List<CrmCampaignMember>();

    public virtual CrmCustomerEngagementPreference? CrmCustomerEngagementPreference { get; set; }

    public virtual ICollection<CrmCustomerKpisnapshot> CrmCustomerKpisnapshots { get; set; } = new List<CrmCustomerKpisnapshot>();

    public virtual ICollection<CrmDataRequest> CrmDataRequests { get; set; } = new List<CrmDataRequest>();

    public virtual ICollection<CrmDuplicateCandidate> CrmDuplicateCandidates { get; set; } = new List<CrmDuplicateCandidate>();

    public virtual ICollection<CrmLeadConversion> CrmLeadConversions { get; set; } = new List<CrmLeadConversion>();

    public virtual ICollection<CrmLead> CrmLeads { get; set; } = new List<CrmLead>();

    public virtual ICollection<CrmMarketFeedbackItem> CrmMarketFeedbackItemCrmfeedbackCompetitorOrgs { get; set; } = new List<CrmMarketFeedbackItem>();

    public virtual ICollection<CrmMarketFeedbackItem> CrmMarketFeedbackItemCrmfeedbackOrgs { get; set; } = new List<CrmMarketFeedbackItem>();

    public virtual ICollection<CrmMessageVariationHistory> CrmMessageVariationHistories { get; set; } = new List<CrmMessageVariationHistory>();

    public virtual ICollection<CrmOpportunity> CrmOpportunities { get; set; } = new List<CrmOpportunity>();

    public virtual ICollection<CrmOpportunityCompetitor> CrmOpportunityCompetitors { get; set; } = new List<CrmOpportunityCompetitor>();

    public virtual ICollection<CrmOrgLifecycleTag> CrmOrgLifecycleTags { get; set; } = new List<CrmOrgLifecycleTag>();

    public virtual ICollection<CrmPersonalMessageDraft> CrmPersonalMessageDrafts { get; set; } = new List<CrmPersonalMessageDraft>();

    public virtual ICollection<CrmPersonalisationProfile> CrmPersonalisationProfiles { get; set; } = new List<CrmPersonalisationProfile>();

    public virtual ICollection<CrmQuickTask> CrmQuickTasks { get; set; } = new List<CrmQuickTask>();

    public virtual ICollection<CrmQuoteFollowupResponse> CrmQuoteFollowupResponses { get; set; } = new List<CrmQuoteFollowupResponse>();

    public virtual ICollection<CrmQuoteFollowup> CrmQuoteFollowups { get; set; } = new List<CrmQuoteFollowup>();

    public virtual ICollection<CrmQuoteLostDetail> CrmQuoteLostDetails { get; set; } = new List<CrmQuoteLostDetail>();

    public virtual ICollection<CrmSentimentSignal> CrmSentimentSignals { get; set; } = new List<CrmSentimentSignal>();

    public virtual ICollection<DocbAssetLibrary> DocbAssetLibraries { get; set; } = new List<DocbAssetLibrary>();

    public virtual ICollection<DocbClauseLibrary> DocbClauseLibraries { get; set; } = new List<DocbClauseLibrary>();

    public virtual ICollection<DocbDocumentTemplate> DocbDocumentTemplates { get; set; } = new List<DocbDocumentTemplate>();

    public virtual ICollection<DocbLibraryPack> DocbLibraryPacks { get; set; } = new List<DocbLibraryPack>();

    public virtual ICollection<DocsecSecurityProfile> DocsecSecurityProfiles { get; set; } = new List<DocsecSecurityProfile>();

    public virtual ICollection<DocsigRecipient> DocsigRecipients { get; set; } = new List<DocsigRecipient>();

    public virtual ICollection<EdiTradingPartner> EdiTradingPartners { get; set; } = new List<EdiTradingPartner>();

    public virtual ICollection<FinAdditionalCostRisk> FinAdditionalCostRisks { get; set; } = new List<FinAdditionalCostRisk>();

    public virtual ICollection<FinAiinsight> FinAiinsights { get; set; } = new List<FinAiinsight>();

    public virtual ICollection<FinCashTransaction> FinCashTransactions { get; set; } = new List<FinCashTransaction>();

    public virtual ICollection<FinCreditHold> FinCreditHolds { get; set; } = new List<FinCreditHold>();

    public virtual ICollection<FinCreditProfile> FinCreditProfiles { get; set; } = new List<FinCreditProfile>();

    public virtual ICollection<FinCreditStopRecommendation> FinCreditStopRecommendations { get; set; } = new List<FinCreditStopRecommendation>();

    public virtual ICollection<FinCustomerPaymentBehaviour> FinCustomerPaymentBehaviours { get; set; } = new List<FinCustomerPaymentBehaviour>();

    public virtual ICollection<FinDebtCase> FinDebtCases { get; set; } = new List<FinDebtCase>();

    public virtual ICollection<FinDisruptionRiskCase> FinDisruptionRiskCases { get; set; } = new List<FinDisruptionRiskCase>();

    public virtual ICollection<FinDocument> FinDocuments { get; set; } = new List<FinDocument>();

    public virtual ICollection<FinDunningItem> FinDunningItems { get; set; } = new List<FinDunningItem>();

    public virtual ICollection<FinOperatingModelSetting> FinOperatingModelSettings { get; set; } = new List<FinOperatingModelSetting>();

    public virtual ICollection<FinPaymentRunItem> FinPaymentRunItems { get; set; } = new List<FinPaymentRunItem>();

    public virtual ICollection<FinProfitShareAgreement> FinProfitShareAgreementFinpsaCustomerOrgs { get; set; } = new List<FinProfitShareAgreement>();

    public virtual ICollection<FinProfitShareAgreement> FinProfitShareAgreementFinpsaPartnerOrgs { get; set; } = new List<FinProfitShareAgreement>();

    public virtual ICollection<FinProfitShareItem> FinProfitShareItems { get; set; } = new List<FinProfitShareItem>();

    public virtual ICollection<FinVarianceCase> FinVarianceCases { get; set; } = new List<FinVarianceCase>();

    public virtual ICollection<FinVarianceTolerance> FinVarianceToleranceFinvarTolCustomerOrgs { get; set; } = new List<FinVarianceTolerance>();

    public virtual ICollection<FinVarianceTolerance> FinVarianceToleranceFinvarTolSupplierOrgs { get; set; } = new List<FinVarianceTolerance>();

    public virtual ICollection<FinVesselRoeset> FinVesselRoesets { get; set; } = new List<FinVesselRoeset>();

    public virtual ICollection<LocProfileScope> LocProfileScopes { get; set; } = new List<LocProfileScope>();

    public virtual ICollection<MdxShareAgreement> MdxShareAgreements { get; set; } = new List<MdxShareAgreement>();

    public virtual ICollection<MdxSharedEquipment> MdxSharedEquipments { get; set; } = new List<MdxSharedEquipment>();

    public virtual ICollection<MdxSharedParty> MdxSharedParties { get; set; } = new List<MdxSharedParty>();

    public virtual ICollection<MdxSharedRouteLeg> MdxSharedRouteLegs { get; set; } = new List<MdxSharedRouteLeg>();

    public virtual ICollection<OrgAddress> OrgAddresses { get; set; } = new List<OrgAddress>();

    public virtual ICollection<OrgContact> OrgContacts { get; set; } = new List<OrgContact>();

    public virtual SysCrmrelationshipStatus? OrgCrmrelationshipStatusCodeNavigation { get; set; }

    public virtual ICollection<PortalActionRequest> PortalActionRequests { get; set; } = new List<PortalActionRequest>();

    public virtual ICollection<PortalApiclient> PortalApiclients { get; set; } = new List<PortalApiclient>();

    public virtual ICollection<PortalAuditEvent> PortalAuditEvents { get; set; } = new List<PortalAuditEvent>();

    public virtual ICollection<PortalFileUpload> PortalFileUploads { get; set; } = new List<PortalFileUpload>();

    public virtual ICollection<PortalInvitation> PortalInvitations { get; set; } = new List<PortalInvitation>();

    public virtual ICollection<PortalNotificationSubscription> PortalNotificationSubscriptions { get; set; } = new List<PortalNotificationSubscription>();

    public virtual ICollection<PortalRecordShare> PortalRecordShares { get; set; } = new List<PortalRecordShare>();

    public virtual ICollection<PortalSite> PortalSites { get; set; } = new List<PortalSite>();

    public virtual ICollection<PortalThreadAccess> PortalThreadAccesses { get; set; } = new List<PortalThreadAccess>();

    public virtual ICollection<PortalUserOrganisation> PortalUserOrganisations { get; set; } = new List<PortalUserOrganisation>();

    public virtual ICollection<PortalUserRole> PortalUserRoles { get; set; } = new List<PortalUserRole>();

    public virtual ICollection<PortalUser> PortalUsers { get; set; } = new List<PortalUser>();

    public virtual ICollection<RateContract> RateContractRatecontractAgentOrgs { get; set; } = new List<RateContract>();

    public virtual ICollection<RateContract> RateContractRatecontractCarrierOrgs { get; set; } = new List<RateContract>();

    public virtual ICollection<RateContract> RateContractRatecontractCustomerOrgs { get; set; } = new List<RateContract>();

    public virtual ICollection<RateContract> RateContractRatecontractSupplierOrgs { get; set; } = new List<RateContract>();

    public virtual ICollection<RateMarginProfile> RateMarginProfiles { get; set; } = new List<RateMarginProfile>();

    public virtual ICollection<RateRateRequest> RateRateRequestRaterequestCarrierOrgs { get; set; } = new List<RateRateRequest>();

    public virtual ICollection<RateRateRequest> RateRateRequestRaterequestCustomerOrgs { get; set; } = new List<RateRateRequest>();

    public virtual ICollection<RateRateResult> RateRateResults { get; set; } = new List<RateRateResult>();

    public virtual ICollection<RateServiceProduct> RateServiceProducts { get; set; } = new List<RateServiceProduct>();

    public virtual ICollection<RateSpotQuote> RateSpotQuoteRatespotCarrierOrgs { get; set; } = new List<RateSpotQuote>();

    public virtual ICollection<RateSpotQuote> RateSpotQuoteRatespotCustomerOrgs { get; set; } = new List<RateSpotQuote>();

    public virtual ICollection<RateSpotQuote> RateSpotQuoteRatespotSupplierOrgs { get; set; } = new List<RateSpotQuote>();

    public virtual ICollection<RateTariffAssignment> RateTariffAssignmentRatetariffAssignCarrierOrgs { get; set; } = new List<RateTariffAssignment>();

    public virtual ICollection<RateTariffAssignment> RateTariffAssignmentRatetariffAssignCustomerOrgs { get; set; } = new List<RateTariffAssignment>();

    public virtual ICollection<RateZoneGroup> RateZoneGroupRatezoneGroupCarrierOrgs { get; set; } = new List<RateZoneGroup>();

    public virtual ICollection<RateZoneGroup> RateZoneGroupRatezoneGroupCustomerOrgs { get; set; } = new List<RateZoneGroup>();

    public virtual ICollection<SecRoleScope> SecRoleScopes { get; set; } = new List<SecRoleScope>();

    public virtual ICollection<TceComplianceCase> TceComplianceCases { get; set; } = new List<TceComplianceCase>();

    public virtual ICollection<TceComplianceCheckItem> TceComplianceCheckItems { get; set; } = new List<TceComplianceCheckItem>();

    public virtual ICollection<TceComplianceChecklist> TceComplianceChecklists { get; set; } = new List<TceComplianceChecklist>();

    public virtual ICollection<TceHsclassification> TceHsclassifications { get; set; } = new List<TceHsclassification>();

    public virtual ICollection<TceIntegrationEvent> TceIntegrationEvents { get; set; } = new List<TceIntegrationEvent>();

    public virtual ICollection<TceLicense> TceLicenses { get; set; } = new List<TceLicense>();

    public virtual ICollection<TceOriginDeclaration> TceOriginDeclarationTceoriginCustomerOrgs { get; set; } = new List<TceOriginDeclaration>();

    public virtual ICollection<TceOriginDeclaration> TceOriginDeclarationTceoriginExporterOrgs { get; set; } = new List<TceOriginDeclaration>();

    public virtual ICollection<TceOriginDeclaration> TceOriginDeclarationTceoriginProducerOrgs { get; set; } = new List<TceOriginDeclaration>();

    public virtual ICollection<TceOwnershipCheck> TceOwnershipChecks { get; set; } = new List<TceOwnershipCheck>();

    public virtual ICollection<TcePolicyScope> TcePolicyScopes { get; set; } = new List<TcePolicyScope>();

    public virtual ICollection<TceRecordLink> TceRecordLinks { get; set; } = new List<TceRecordLink>();

    public virtual ICollection<TceScreeningPolicy> TceScreeningPolicies { get; set; } = new List<TceScreeningPolicy>();

    public virtual ICollection<TceScreeningRun> TceScreeningRuns { get; set; } = new List<TceScreeningRun>();

    public virtual ICollection<TceScreeningSubject> TceScreeningSubjects { get; set; } = new List<TceScreeningSubject>();

    public virtual ICollection<TceWhitelist> TceWhitelists { get; set; } = new List<TceWhitelist>();

    public virtual ICollection<WmsAppointmentSlot> WmsAppointmentSlots { get; set; } = new List<WmsAppointmentSlot>();

    public virtual ICollection<WmsBillingEvent> WmsBillingEvents { get; set; } = new List<WmsBillingEvent>();

    public virtual ICollection<WmsBondedAuthorisation> WmsBondedAuthorisations { get; set; } = new List<WmsBondedAuthorisation>();

    public virtual ICollection<WmsBondedDepositor> WmsBondedDepositors { get; set; } = new List<WmsBondedDepositor>();

    public virtual ICollection<WmsBondedEntry> WmsBondedEntryWmsbondEntryDepositorOrgs { get; set; } = new List<WmsBondedEntry>();

    public virtual ICollection<WmsBondedEntry> WmsBondedEntryWmsbondEntryImporterOrgs { get; set; } = new List<WmsBondedEntry>();

    public virtual ICollection<WmsBondedGuarantee> WmsBondedGuarantees { get; set; } = new List<WmsBondedGuarantee>();

    public virtual ICollection<WmsBondedRemoval> WmsBondedRemovals { get; set; } = new List<WmsBondedRemoval>();

    public virtual ICollection<WmsCustomerProfile> WmsCustomerProfiles { get; set; } = new List<WmsCustomerProfile>();

    public virtual ICollection<WmsCycleCountPlan> WmsCycleCountPlans { get; set; } = new List<WmsCycleCountPlan>();

    public virtual ICollection<WmsDispatch> WmsDispatches { get; set; } = new List<WmsDispatch>();

    public virtual ICollection<WmsFacility> WmsFacilityWmsfacilityOperatorOrgs { get; set; } = new List<WmsFacility>();

    public virtual ICollection<WmsFacility> WmsFacilityWmsfacilityOwnerOrgs { get; set; } = new List<WmsFacility>();

    public virtual ICollection<WmsHandlingUnit> WmsHandlingUnits { get; set; } = new List<WmsHandlingUnit>();

    public virtual ICollection<WmsInboundAdvice> WmsInboundAdviceWmsadviceCarrierOrgs { get; set; } = new List<WmsInboundAdvice>();

    public virtual ICollection<WmsInboundAdvice> WmsInboundAdviceWmsadviceCustomerOrgs { get; set; } = new List<WmsInboundAdvice>();

    public virtual ICollection<WmsInboundAdvice> WmsInboundAdviceWmsadviceSupplierOrgs { get; set; } = new List<WmsInboundAdvice>();

    public virtual ICollection<WmsInventoryBalance> WmsInventoryBalances { get; set; } = new List<WmsInventoryBalance>();

    public virtual ICollection<WmsInventoryLot> WmsInventoryLots { get; set; } = new List<WmsInventoryLot>();

    public virtual ICollection<WmsInventoryTransaction> WmsInventoryTransactions { get; set; } = new List<WmsInventoryTransaction>();

    public virtual ICollection<WmsItem> WmsItems { get; set; } = new List<WmsItem>();

    public virtual ICollection<WmsKpiresult> WmsKpiresults { get; set; } = new List<WmsKpiresult>();

    public virtual ICollection<WmsOrderParty> WmsOrderParties { get; set; } = new List<WmsOrderParty>();

    public virtual ICollection<WmsOrder> WmsOrderWmsorderCarrierOrgs { get; set; } = new List<WmsOrder>();

    public virtual ICollection<WmsOrder> WmsOrderWmsorderCustomerOrgs { get; set; } = new List<WmsOrder>();

    public virtual ICollection<WmsOrder> WmsOrderWmsorderInboundFromOrgs { get; set; } = new List<WmsOrder>();

    public virtual ICollection<WmsOrder> WmsOrderWmsorderOutboundToOrgs { get; set; } = new List<WmsOrder>();

    public virtual ICollection<WmsPackage> WmsPackages { get; set; } = new List<WmsPackage>();

    public virtual ICollection<WmsWave> WmsWaves { get; set; } = new List<WmsWave>();

    public virtual ICollection<OrgType> OrgTypes { get; set; } = new List<OrgType>();
}
