using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MdxSharedMilestone
{
    public Guid MdxmilestoneId { get; set; }

    public Guid MdxmilestoneSharedJobId { get; set; }

    public Guid? MdxmilestoneRouteId { get; set; }

    public Guid? MdxmilestoneLocalMilestoneId { get; set; }

    public string? MdxmilestoneRemoteMilestoneId { get; set; }

    public string MdxmilestoneStatusCode { get; set; } = null!;

    public string MdxmilestoneTypeCode { get; set; } = null!;

    public string? MdxmilestoneNameSnapshot { get; set; }

    public DateTime? MdxmilestonePlannedAt { get; set; }

    public DateTime? MdxmilestoneEstimatedAt { get; set; }

    public DateTime? MdxmilestoneActualAt { get; set; }

    public string? MdxmilestoneLocationUnlocode { get; set; }

    public string? MdxmilestoneLocationNameSnapshot { get; set; }

    public string? MdxmilestoneSourceParty { get; set; }

    public string? MdxmilestoneSource { get; set; }

    public string? MdxmilestoneNotes { get; set; }

    public string MdxmilestoneMetadataJson { get; set; } = null!;

    public DateTime MdxmilestoneUpdatedAt { get; set; }

    public virtual MdxSharedRouteLeg? MdxmilestoneRoute { get; set; }

    public virtual MdxSharedJob MdxmilestoneSharedJob { get; set; } = null!;

    public virtual SysMdxrecordStatus MdxmilestoneStatusCodeNavigation { get; set; } = null!;
}
