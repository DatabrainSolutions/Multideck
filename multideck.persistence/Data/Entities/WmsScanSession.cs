using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsScanSession
{
    public Guid WmsscanSessionId { get; set; }

    public Guid WmsscanSessionFacilityId { get; set; }

    public Guid? WmsscanSessionUserId { get; set; }

    public string? WmsscanSessionDeviceId { get; set; }

    public Guid? WmsscanSessionTaskId { get; set; }

    public DateTime WmsscanSessionStartedAt { get; set; }

    public DateTime? WmsscanSessionEndedAt { get; set; }

    public string WmsscanSessionMetadataJson { get; set; } = null!;

    public virtual ICollection<WmsScanEvent> WmsScanEvents { get; set; } = new List<WmsScanEvent>();

    public virtual WmsFacility WmsscanSessionFacility { get; set; } = null!;

    public virtual WmsTask? WmsscanSessionTask { get; set; }

    public virtual CmpUser? WmsscanSessionUser { get; set; }
}
