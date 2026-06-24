using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class OrgAddress
{
    public Guid OrgAddId { get; set; }

    public Guid OrgId { get; set; }

    public string? OrgNameOverride { get; set; }

    public string? OrgAddLine1 { get; set; }

    public string? OrgAddLine2 { get; set; }

    public string? OrgAddTownCity { get; set; }

    public string? OrgAddCountyState { get; set; }

    public string? OrgAddPostZipCode { get; set; }

    public string? OrgAddCountry { get; set; }

    public string? OrgAddUnlocode { get; set; }

    public string? OrgAddMainEmail { get; set; }

    public string? OrgAddMainPhone { get; set; }

    public virtual OrgMaster Org { get; set; } = null!;

    public virtual ICollection<OrgAddressType> OrgAddressTypes { get; set; } = new List<OrgAddressType>();
}
