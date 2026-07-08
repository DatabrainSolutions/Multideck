using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AcciExportBatch
{
    public Guid AcciebId { get; set; }

    public Guid AcciebConnectionId { get; set; }

    public long AcciebBatchNo { get; set; }

    public string AcciebStatusCode { get; set; } = null!;

    public Guid? AcciebOrgOfficeId { get; set; }

    public Guid? AcciebLegalEntityId { get; set; }

    public int AcciebDocumentCount { get; set; }

    public decimal AcciebNetTotalLocal { get; set; }

    public decimal AcciebTaxTotalLocal { get; set; }

    public decimal AcciebGrossTotalLocal { get; set; }

    public DateTime? AcciebApprovedAt { get; set; }

    public Guid? AcciebApprovedBy { get; set; }

    public DateTime? AcciebExportStartedAt { get; set; }

    public DateTime? AcciebExportCompletedAt { get; set; }

    public DateTime AcciebCreatedAt { get; set; }

    public Guid? AcciebCreatedBy { get; set; }

    public virtual ICollection<AcciExportItem> AcciExportItems { get; set; } = new List<AcciExportItem>();

    public virtual CmpUser? AcciebApprovedByNavigation { get; set; }

    public virtual AcciConnection AcciebConnection { get; set; } = null!;

    public virtual CmpUser? AcciebCreatedByNavigation { get; set; }

    public virtual CmpLegalEntity? AcciebLegalEntity { get; set; }

    public virtual CmpOffice? AcciebOrgOffice { get; set; }

    public virtual SysAccountingSyncStatus AcciebStatusCodeNavigation { get; set; } = null!;

    public virtual ICollection<FinDocument> FinDocuments { get; set; } = new List<FinDocument>();

    public virtual ICollection<FinIntegrationQueue> FinIntegrationQueues { get; set; } = new List<FinIntegrationQueue>();
}
