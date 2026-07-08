using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CmpLegalEntity
{
    public Guid LegalEntityId { get; set; }

    public Guid CompanyId { get; set; }

    public Guid? LegalEntityOrgId { get; set; }

    public string LegalEntityName { get; set; } = null!;

    public string? LegalEntityTradingName { get; set; }

    public string? LegalEntityCompanyRegistrationNo { get; set; }

    public string? LegalEntityVatnumber { get; set; }

    public string? LegalEntityEorinumber { get; set; }

    public string? LegalEntityTaxId { get; set; }

    public string? LegalEntityCountryCode { get; set; }

    public Guid? LegalEntityBaseCurrencyId { get; set; }

    public string? LegalEntityBaseCurrencyCodeSnapshot { get; set; }

    public string? LegalEntityAddressSnapshot { get; set; }

    public string? LegalEntityEmailSnapshot { get; set; }

    public string? LegalEntityPhoneSnapshot { get; set; }

    public bool LegalEntityIsDefault { get; set; }

    public bool LegalEntityIsActive { get; set; }

    public string LegalEntitySettingsJson { get; set; } = null!;

    public DateTime LegalEntityCreatedAt { get; set; }

    public Guid? LegalEntityCreatedBy { get; set; }

    public DateTime LegalEntityUpdatedAt { get; set; }

    public Guid? LegalEntityUpdatedBy { get; set; }

    public virtual ICollection<AcciConnection> AcciConnections { get; set; } = new List<AcciConnection>();

    public virtual ICollection<AcciExportBatch> AcciExportBatches { get; set; } = new List<AcciExportBatch>();

    public virtual ICollection<AiContextRule> AiContextRules { get; set; } = new List<AiContextRule>();

    public virtual ICollection<AiContextStoreScope> AiContextStoreScopes { get; set; } = new List<AiContextStoreScope>();

    public virtual ICollection<AiConversation> AiConversations { get; set; } = new List<AiConversation>();

    public virtual ICollection<AiTaskRun> AiTaskRuns { get; set; } = new List<AiTaskRun>();

    public virtual ICollection<AuditEvent> AuditEvents { get; set; } = new List<AuditEvent>();

    public virtual ICollection<AuditRequestContext> AuditRequestContexts { get; set; } = new List<AuditRequestContext>();

    public virtual ICollection<AwbHeader> AwbHeaders { get; set; } = new List<AwbHeader>();

    public virtual ICollection<BlHeader> BlHeaders { get; set; } = new List<BlHeader>();

    public virtual ICollection<ClmClaim> ClmClaims { get; set; } = new List<ClmClaim>();

    public virtual ICollection<ClmIncident> ClmIncidents { get; set; } = new List<ClmIncident>();

    public virtual ICollection<ClmInsurancePolicy> ClmInsurancePolicies { get; set; } = new List<ClmInsurancePolicy>();

    public virtual ICollection<ClmKpiresult> ClmKpiresults { get; set; } = new List<ClmKpiresult>();

    public virtual ICollection<CmpBrand> CmpBrands { get; set; } = new List<CmpBrand>();

    public virtual ICollection<CmpOfficeLegalEntity> CmpOfficeLegalEntities { get; set; } = new List<CmpOfficeLegalEntity>();

    public virtual ICollection<CmpOffice> CmpOffices { get; set; } = new List<CmpOffice>();

    public virtual ICollection<CommAiautomationPolicy> CommAiautomationPolicies { get; set; } = new List<CommAiautomationPolicy>();

    public virtual ICollection<CommMailbox> CommMailboxes { get; set; } = new List<CommMailbox>();

    public virtual ICollection<CommMessageTemplate> CommMessageTemplates { get; set; } = new List<CommMessageTemplate>();

    public virtual ICollection<CommProviderConnection> CommProviderConnections { get; set; } = new List<CommProviderConnection>();

    public virtual ICollection<CommRoutingRule> CommRoutingRules { get; set; } = new List<CommRoutingRule>();

    public virtual ICollection<CommThread> CommThreads { get; set; } = new List<CommThread>();

    public virtual CmpCompany Company { get; set; } = null!;

    public virtual ICollection<CrmAccountProfile> CrmAccountProfiles { get; set; } = new List<CrmAccountProfile>();

    public virtual ICollection<CrmActivityWorkflowRule> CrmActivityWorkflowRules { get; set; } = new List<CrmActivityWorkflowRule>();

    public virtual ICollection<CrmAutomationPlaybook> CrmAutomationPlaybooks { get; set; } = new List<CrmAutomationPlaybook>();

    public virtual ICollection<CrmLead> CrmLeads { get; set; } = new List<CrmLead>();

    public virtual ICollection<CrmOpportunity> CrmOpportunities { get; set; } = new List<CrmOpportunity>();

    public virtual ICollection<CrmSetting> CrmSettings { get; set; } = new List<CrmSetting>();

    public virtual ICollection<CrmTerritory> CrmTerritories { get; set; } = new List<CrmTerritory>();

    public virtual ICollection<CusQuoteHeader> CusQuoteHeaders { get; set; } = new List<CusQuoteHeader>();

    public virtual ICollection<DocbAssetLibrary> DocbAssetLibraries { get; set; } = new List<DocbAssetLibrary>();

    public virtual ICollection<DocbClauseLibrary> DocbClauseLibraries { get; set; } = new List<DocbClauseLibrary>();

    public virtual ICollection<DocbDocumentTemplate> DocbDocumentTemplates { get; set; } = new List<DocbDocumentTemplate>();

    public virtual ICollection<DocbLibraryPack> DocbLibraryPacks { get; set; } = new List<DocbLibraryPack>();

    public virtual ICollection<DocbTheme> DocbThemes { get; set; } = new List<DocbTheme>();

    public virtual ICollection<DocsecSecurityProfile> DocsecSecurityProfiles { get; set; } = new List<DocsecSecurityProfile>();

    public virtual ICollection<DocsecSigningKey> DocsecSigningKeys { get; set; } = new List<DocsecSigningKey>();

    public virtual ICollection<EdiConnection> EdiConnections { get; set; } = new List<EdiConnection>();

    public virtual ICollection<FinAuthorityRule> FinAuthorityRules { get; set; } = new List<FinAuthorityRule>();

    public virtual ICollection<FinBankAccount> FinBankAccounts { get; set; } = new List<FinBankAccount>();

    public virtual ICollection<FinCreditProfile> FinCreditProfiles { get; set; } = new List<FinCreditProfile>();

    public virtual ICollection<FinCustomerPaymentBehaviour> FinCustomerPaymentBehaviours { get; set; } = new List<FinCustomerPaymentBehaviour>();

    public virtual ICollection<FinCutoffRun> FinCutoffRuns { get; set; } = new List<FinCutoffRun>();

    public virtual ICollection<FinDocument> FinDocuments { get; set; } = new List<FinDocument>();

    public virtual ICollection<FinDunningRun> FinDunningRuns { get; set; } = new List<FinDunningRun>();

    public virtual ICollection<FinLocalisationSetting> FinLocalisationSettings { get; set; } = new List<FinLocalisationSetting>();

    public virtual ICollection<FinNominalAccount> FinNominalAccounts { get; set; } = new List<FinNominalAccount>();

    public virtual ICollection<FinNumberSequence> FinNumberSequences { get; set; } = new List<FinNumberSequence>();

    public virtual ICollection<FinOperatingModelSetting> FinOperatingModelSettings { get; set; } = new List<FinOperatingModelSetting>();

    public virtual ICollection<FinPeriod> FinPeriods { get; set; } = new List<FinPeriod>();

    public virtual ICollection<FinPostingBatch> FinPostingBatches { get; set; } = new List<FinPostingBatch>();

    public virtual ICollection<FinSetting> FinSettings { get; set; } = new List<FinSetting>();

    public virtual ICollection<FinTaxReturnPeriod> FinTaxReturnPeriods { get; set; } = new List<FinTaxReturnPeriod>();

    public virtual ICollection<JobHeader> JobHeaders { get; set; } = new List<JobHeader>();

    public virtual ICollection<LocProfileScope> LocProfileScopes { get; set; } = new List<LocProfileScope>();

    public virtual ICollection<MdxShareAgreement> MdxShareAgreements { get; set; } = new List<MdxShareAgreement>();

    public virtual ICollection<PortalSite> PortalSites { get; set; } = new List<PortalSite>();

    public virtual ICollection<RateContract> RateContracts { get; set; } = new List<RateContract>();

    public virtual ICollection<RateMarginProfile> RateMarginProfiles { get; set; } = new List<RateMarginProfile>();

    public virtual ICollection<RateRateRequest> RateRateRequests { get; set; } = new List<RateRateRequest>();

    public virtual ICollection<RateTariffAssignment> RateTariffAssignments { get; set; } = new List<RateTariffAssignment>();

    public virtual ICollection<RptKpiresult> RptKpiresults { get; set; } = new List<RptKpiresult>();

    public virtual ICollection<RptKpitarget> RptKpitargets { get; set; } = new List<RptKpitarget>();

    public virtual ICollection<SecRoleScope> SecRoleScopes { get; set; } = new List<SecRoleScope>();

    public virtual ICollection<SubFeatureFlagRule> SubFeatureFlagRules { get; set; } = new List<SubFeatureFlagRule>();

    public virtual ICollection<TceComplianceChecklist> TceComplianceChecklists { get; set; } = new List<TceComplianceChecklist>();

    public virtual ICollection<TceIntegrationEvent> TceIntegrationEvents { get; set; } = new List<TceIntegrationEvent>();

    public virtual ICollection<TceInternalWatchlist> TceInternalWatchlists { get; set; } = new List<TceInternalWatchlist>();

    public virtual ICollection<TceLicense> TceLicenses { get; set; } = new List<TceLicense>();

    public virtual ICollection<TcePolicyScope> TcePolicyScopes { get; set; } = new List<TcePolicyScope>();

    public virtual ICollection<TceScreeningPolicy> TceScreeningPolicies { get; set; } = new List<TceScreeningPolicy>();

    public virtual ICollection<TceScreeningRun> TceScreeningRuns { get; set; } = new List<TceScreeningRun>();

    public virtual ICollection<WorkflowDefinition> WorkflowDefinitions { get; set; } = new List<WorkflowDefinition>();

    public virtual ICollection<WorkflowInstance> WorkflowInstances { get; set; } = new List<WorkflowInstance>();

    public virtual ICollection<WorkflowSlaprofile> WorkflowSlaprofiles { get; set; } = new List<WorkflowSlaprofile>();

    public virtual ICollection<WorkflowTask> WorkflowTasks { get; set; } = new List<WorkflowTask>();

    public virtual ICollection<WorkflowWorkQueue> WorkflowWorkQueues { get; set; } = new List<WorkflowWorkQueue>();
}
