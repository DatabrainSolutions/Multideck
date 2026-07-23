using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RefCountryState
{
    public Guid? RwPk { get; set; }

    public bool? RwIsActive { get; set; }

    public bool? RwIsSystem { get; set; }

    public string? RwCode { get; set; }

    public string? RwRnNkcountryCode { get; set; }

    public string? RwDescription { get; set; }

    public string? RwRegionName { get; set; }

    public short? RwAutoVersion { get; set; }

    public string? RwSystemCreateUser { get; set; }

    public DateTime? RwSystemLastEditTimeUtc { get; set; }

    public string? RwSystemLastEditUser { get; set; }

    public DateTime? RwSystemCreateTimeUtc { get; set; }
}
