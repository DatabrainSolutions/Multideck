using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsTaskEvent
{
    public Guid WmstaskEventId { get; set; }

    public Guid WmstaskEventTaskId { get; set; }

    public string WmstaskEventEventTypeCode { get; set; } = null!;

    public string? WmstaskEventFromStatusCode { get; set; }

    public string? WmstaskEventToStatusCode { get; set; }

    public DateTime WmstaskEventEventAt { get; set; }

    public Guid? WmstaskEventEventBy { get; set; }

    public string? WmstaskEventNotes { get; set; }

    public string WmstaskEventMetadataJson { get; set; } = null!;

    public virtual CmpUser? WmstaskEventEventByNavigation { get; set; }

    public virtual WmsTask WmstaskEventTask { get; set; } = null!;
}
