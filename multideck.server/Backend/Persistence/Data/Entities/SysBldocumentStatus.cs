using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysBldocumentStatus
{
    public string BldsCode { get; set; } = null!;

    public string BldsName { get; set; } = null!;

    public string? BldsDescription { get; set; }

    public int BldsSortOrder { get; set; }

    public bool BldsIsFinal { get; set; }

    public virtual ICollection<BlHeader> BlHeaders { get; set; } = new List<BlHeader>();

    public virtual ICollection<BlStatusHistory> BlStatusHistoryBlshFromStatusNavigations { get; set; } = new List<BlStatusHistory>();

    public virtual ICollection<BlStatusHistory> BlStatusHistoryBlshToStatusNavigations { get; set; } = new List<BlStatusHistory>();

    public virtual ICollection<BlVersion> BlVersions { get; set; } = new List<BlVersion>();
}
