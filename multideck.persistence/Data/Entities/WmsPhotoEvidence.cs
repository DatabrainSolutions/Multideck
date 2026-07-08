using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsPhotoEvidence
{
    public Guid WmsphotoId { get; set; }

    public Guid WmsphotoFacilityId { get; set; }

    public string WmsphotoRecordTypeCode { get; set; } = null!;

    public Guid WmsphotoRecordId { get; set; }

    public Guid? WmsphotoJobId { get; set; }

    public string WmsphotoFileRef { get; set; } = null!;

    public string? WmsphotoFileHash { get; set; }

    public string? WmsphotoCaption { get; set; }

    public bool WmsphotoSensitive { get; set; }

    public DateTime WmsphotoCapturedAt { get; set; }

    public Guid? WmsphotoCapturedBy { get; set; }

    public virtual CmpUser? WmsphotoCapturedByNavigation { get; set; }

    public virtual WmsFacility WmsphotoFacility { get; set; } = null!;

    public virtual JobHeader? WmsphotoJob { get; set; }
}
