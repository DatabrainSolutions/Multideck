using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AcciExternalRef
{
    public Guid AccierId { get; set; }

    public Guid AccierConnectionId { get; set; }

    public string AccierDocumentTypeCode { get; set; } = null!;

    public string AccierLocalTable { get; set; } = null!;

    public Guid AccierLocalId { get; set; }

    public string? AccierLocalNumber { get; set; }

    public string AccierExternalObjectType { get; set; } = null!;

    public string AccierExternalId { get; set; } = null!;

    public string? AccierExternalNumber { get; set; }

    public string? AccierExternalUrl { get; set; }

    public string AccierSyncStatusCode { get; set; } = null!;

    public string? AccierProviderSyncToken { get; set; }

    public string? AccierProviderEtag { get; set; }

    public DateTime AccierLastSyncedAt { get; set; }

    public string AccierLastPayloadJson { get; set; } = null!;

    public DateTime AccierCreatedAt { get; set; }

    public virtual ICollection<AcciExportItem> AcciExportItems { get; set; } = new List<AcciExportItem>();

    public virtual ICollection<AcciReconciliationIssue> AcciReconciliationIssues { get; set; } = new List<AcciReconciliationIssue>();

    public virtual AcciConnection AccierConnection { get; set; } = null!;

    public virtual SysAccountingDocumentType AccierDocumentTypeCodeNavigation { get; set; } = null!;

    public virtual SysAccountingSyncStatus AccierSyncStatusCodeNavigation { get; set; } = null!;
}
