using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// AWB legal and operational parties using Org_* links plus immutable document snapshots.
/// </summary>
public partial class AwbParty
{
    public Guid AwbpId { get; set; }

    public Guid AwbpAwbid { get; set; }

    public string AwbpRole { get; set; } = null!;

    public Guid? AwbpOrgId { get; set; }

    public Guid? AwbpAddressId { get; set; }

    public Guid? AwbpContactId { get; set; }

    public string AwbpNameSnapshot { get; set; } = null!;

    public string? AwbpAddressLine1Snapshot { get; set; }

    public string? AwbpAddressLine2Snapshot { get; set; }

    public string? AwbpCitySnapshot { get; set; }

    public string? AwbpRegionSnapshot { get; set; }

    public string? AwbpPostcodeSnapshot { get; set; }

    public Guid? AwbpCountryId { get; set; }

    public string? AwbpCountryCodeSnapshot { get; set; }

    public string? AwbpPhoneSnapshot { get; set; }

    public string? AwbpEmailSnapshot { get; set; }

    public string? AwbpIatacodeSnapshot { get; set; }

    public string? AwbpAccountNumberSnapshot { get; set; }

    public string? AwbpTaxRegistrationSnapshot { get; set; }

    public string? AwbpEorinumberSnapshot { get; set; }

    public int AwbpSortOrder { get; set; }

    public bool AwbpIsPrintVisible { get; set; }

    public string? AwbpNotes { get; set; }

    public DateTime AwbpCreatedAt { get; set; }

    public virtual ICollection<AwbPartyIdentifier> AwbPartyIdentifiers { get; set; } = new List<AwbPartyIdentifier>();

    public virtual AwbHeader AwbpAwb { get; set; } = null!;

    public virtual SysAwbpartyRole AwbpRoleNavigation { get; set; } = null!;
}
