using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceWhitelist
{
    public Guid TcewhitelistId { get; set; }

    public string TcewhitelistSubjectName { get; set; } = null!;

    public string? TcewhitelistNormalizedName { get; set; }

    public Guid? TcewhitelistOrgId { get; set; }

    public Guid? TcewhitelistEntryId { get; set; }

    public Guid? TcewhitelistSourceId { get; set; }

    public string TcewhitelistReason { get; set; } = null!;

    public DateOnly TcewhitelistValidFrom { get; set; }

    public DateOnly? TcewhitelistValidTo { get; set; }

    public bool TcewhitelistIsActive { get; set; }

    public Guid? TcewhitelistApprovedBy { get; set; }

    public DateTime? TcewhitelistApprovedAt { get; set; }

    public DateTime TcewhitelistCreatedAt { get; set; }

    public Guid? TcewhitelistCreatedBy { get; set; }

    public virtual CmpUser? TcewhitelistApprovedByNavigation { get; set; }

    public virtual CmpUser? TcewhitelistCreatedByNavigation { get; set; }

    public virtual TceWatchlistEntry? TcewhitelistEntry { get; set; }

    public virtual OrgMaster? TcewhitelistOrg { get; set; }

    public virtual TceDataSource? TcewhitelistSource { get; set; }
}
