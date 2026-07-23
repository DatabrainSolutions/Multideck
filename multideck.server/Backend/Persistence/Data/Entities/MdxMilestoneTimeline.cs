using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MdxMilestoneTimeline
{
    public Guid? MdxmilestoneId { get; set; }

    public Guid? MdxmilestoneSharedJobId { get; set; }

    public string? MdxsharedJobLocalJobNumberSnapshot { get; set; }

    public string? MdxsharedJobRemoteJobNumber { get; set; }

    public Guid? MdxmilestoneRouteId { get; set; }

    public int? MdxrouteSequence { get; set; }

    public string? MdxrouteModeCode { get; set; }

    public string? MdxmilestoneTypeCode { get; set; }

    public string? MdxmilestoneNameSnapshot { get; set; }

    public string? MdxmilestoneStatusCode { get; set; }

    public DateTime? MdxmilestonePlannedAt { get; set; }

    public DateTime? MdxmilestoneEstimatedAt { get; set; }

    public DateTime? MdxmilestoneActualAt { get; set; }

    public string? MdxmilestoneLocationUnlocode { get; set; }

    public string? MdxmilestoneLocationNameSnapshot { get; set; }

    public string? MdxmilestoneSourceParty { get; set; }

    public string? MdxmilestoneSource { get; set; }

    public DateTime? MdxmilestoneUpdatedAt { get; set; }
}
