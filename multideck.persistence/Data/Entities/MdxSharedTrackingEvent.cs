using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MdxSharedTrackingEvent
{
    public Guid MdxtrackEventId { get; set; }

    public Guid MdxtrackEventSharedJobId { get; set; }

    public Guid? MdxtrackEventRouteId { get; set; }

    public Guid? MdxtrackEventLocalTrackingEventId { get; set; }

    public string? MdxtrackEventRemoteTrackingEventId { get; set; }

    public string MdxtrackEventStatusCode { get; set; } = null!;

    public string? MdxtrackEventEventTypeCode { get; set; }

    public DateTime MdxtrackEventEventAt { get; set; }

    public string? MdxtrackEventLocationUnlocode { get; set; }

    public string? MdxtrackEventLocationNameSnapshot { get; set; }

    public string? MdxtrackEventDescription { get; set; }

    public string? MdxtrackEventSource { get; set; }

    public string? MdxtrackEventProviderEventId { get; set; }

    public string MdxtrackEventPayloadJson { get; set; } = null!;

    public DateTime MdxtrackEventCreatedAt { get; set; }

    public virtual MdxSharedRouteLeg? MdxtrackEventRoute { get; set; }

    public virtual MdxSharedJob MdxtrackEventSharedJob { get; set; } = null!;

    public virtual SysMdxrecordStatus MdxtrackEventStatusCodeNavigation { get; set; } = null!;
}
