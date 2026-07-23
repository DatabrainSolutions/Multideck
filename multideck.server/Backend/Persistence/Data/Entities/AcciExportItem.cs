using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AcciExportItem
{
    public Guid AccieiId { get; set; }

    public Guid AccieiBatchId { get; set; }

    public string AccieiDocumentTypeCode { get; set; } = null!;

    public string AccieiLocalTable { get; set; } = null!;

    public Guid AccieiLocalId { get; set; }

    public string? AccieiLocalNumber { get; set; }

    public string AccieiStatusCode { get; set; } = null!;

    public Guid? AccieiExternalRefId { get; set; }

    public int AccieiAttemptCount { get; set; }

    public DateTime? AccieiLastAttemptAt { get; set; }

    public string? AccieiLastErrorCode { get; set; }

    public string? AccieiLastErrorMessage { get; set; }

    public string AccieiRequestPayloadJson { get; set; } = null!;

    public string AccieiResponsePayloadJson { get; set; } = null!;

    public DateTime AccieiCreatedAt { get; set; }

    public virtual AcciExportBatch AccieiBatch { get; set; } = null!;

    public virtual SysAccountingDocumentType AccieiDocumentTypeCodeNavigation { get; set; } = null!;

    public virtual AcciExternalRef? AccieiExternalRef { get; set; }

    public virtual SysAccountingSyncStatus AccieiStatusCodeNavigation { get; set; } = null!;
}
