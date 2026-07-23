using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsDocument
{
    public Guid WmsdocumentId { get; set; }

    public Guid? WmsdocumentFacilityId { get; set; }

    public Guid? WmsdocumentOrderId { get; set; }

    public Guid? WmsdocumentJobId { get; set; }

    public Guid? WmsdocumentJobDocumentId { get; set; }

    public Guid? WmsdocumentGeneratedDocumentId { get; set; }

    public string WmsdocumentDocumentTypeCode { get; set; } = null!;

    public string WmsdocumentTitle { get; set; } = null!;

    public string WmsdocumentStatusCode { get; set; } = null!;

    public string? WmsdocumentFileRef { get; set; }

    public string? WmsdocumentFileHash { get; set; }

    public Guid? WmsdocumentQrverificationTokenId { get; set; }

    public DateTime WmsdocumentCreatedAt { get; set; }

    public Guid? WmsdocumentCreatedBy { get; set; }

    public virtual CmpUser? WmsdocumentCreatedByNavigation { get; set; }

    public virtual WmsFacility? WmsdocumentFacility { get; set; }

    public virtual DocbGeneratedDocument? WmsdocumentGeneratedDocument { get; set; }

    public virtual JobHeader? WmsdocumentJob { get; set; }

    public virtual JobDocument? WmsdocumentJobDocument { get; set; }

    public virtual WmsOrder? WmsdocumentOrder { get; set; }
}
