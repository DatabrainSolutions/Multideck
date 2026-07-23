using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AcciConnection
{
    public Guid AccicId { get; set; }

    public string AccicProviderCode { get; set; } = null!;

    public string AccicName { get; set; } = null!;

    public string AccicStatusCode { get; set; } = null!;

    public Guid? AccicOrgOfficeId { get; set; }

    public Guid? AccicLegalEntityId { get; set; }

    public Guid? AccicBrandId { get; set; }

    public string AccicEnvironment { get; set; } = null!;

    public string AccicAuthType { get; set; } = null!;

    public string? AccicSecretRef { get; set; }

    public string? AccicWebhookSecretRef { get; set; }

    public string? AccicLocalAgentPairingRef { get; set; }

    public string? AccicExternalTenantId { get; set; }

    public string? AccicExternalTenantName { get; set; }

    public string? AccicExternalBaseCurrencyCode { get; set; }

    public string? AccicExternalCountryCode { get; set; }

    public DateTime? AccicLastAuthAt { get; set; }

    public DateTime? AccicLastSyncAt { get; set; }

    public string AccicSettingsJson { get; set; } = null!;

    public DateTime AccicCreatedAt { get; set; }

    public Guid? AccicCreatedBy { get; set; }

    public DateTime AccicUpdatedAt { get; set; }

    public Guid? AccicUpdatedBy { get; set; }

    public virtual ICollection<AcciAccountMapping> AcciAccountMappings { get; set; } = new List<AcciAccountMapping>();

    public virtual ICollection<AcciChargeCodeMapping> AcciChargeCodeMappings { get; set; } = new List<AcciChargeCodeMapping>();

    public virtual ICollection<AcciDimensionMapping> AcciDimensionMappings { get; set; } = new List<AcciDimensionMapping>();

    public virtual ICollection<AcciExportBatch> AcciExportBatches { get; set; } = new List<AcciExportBatch>();

    public virtual ICollection<AcciExternalRef> AcciExternalRefs { get; set; } = new List<AcciExternalRef>();

    public virtual ICollection<AcciLocalAgent> AcciLocalAgents { get; set; } = new List<AcciLocalAgent>();

    public virtual ICollection<AcciPartyMapping> AcciPartyMappings { get; set; } = new List<AcciPartyMapping>();

    public virtual ICollection<AcciReconciliationIssue> AcciReconciliationIssues { get; set; } = new List<AcciReconciliationIssue>();

    public virtual ICollection<AcciSyncEvent> AcciSyncEvents { get; set; } = new List<AcciSyncEvent>();

    public virtual ICollection<AcciSyncRun> AcciSyncRuns { get; set; } = new List<AcciSyncRun>();

    public virtual ICollection<AcciTaxCodeMapping> AcciTaxCodeMappings { get; set; } = new List<AcciTaxCodeMapping>();

    public virtual ICollection<AcciWebhookEvent> AcciWebhookEvents { get; set; } = new List<AcciWebhookEvent>();

    public virtual CmpBrand? AccicBrand { get; set; }

    public virtual CmpUser? AccicCreatedByNavigation { get; set; }

    public virtual CmpLegalEntity? AccicLegalEntity { get; set; }

    public virtual CmpOffice? AccicOrgOffice { get; set; }

    public virtual SysAccountingProvider AccicProviderCodeNavigation { get; set; } = null!;

    public virtual SysAccountingConnectionStatus AccicStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? AccicUpdatedByNavigation { get; set; }
}
