using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCommodityCode
{
    public Guid? RhPk { get; set; }

    public string? RhCode { get; set; }

    public bool? RhIsActive { get; set; }

    public string? RhDescription { get; set; }

    public bool? RhIsTimber { get; set; }

    public bool? RhIsPerishable { get; set; }

    public bool? RhIsFlammable { get; set; }

    public bool? RhIsHazardous { get; set; }

    public DateTime? RhExpiryDate { get; set; }

    public string? RhReeferMinTemperature { get; set; }

    public string? RhReeferMaxTemperature { get; set; }

    public bool? RhContainerVentRequired { get; set; }

    public string? RhFnNknmfc { get; set; }

    public bool? RhIsForwarding { get; set; }

    public bool? RhIsLandTransport { get; set; }

    public bool? RhIsPersonalEffects { get; set; }

    public bool? RhIsShipping { get; set; }

    public bool? RhIsSystem { get; set; }

    public string? RhUniversalCommodityGroup { get; set; }

    public short? RhAutoVersion { get; set; }

    public string? RhIatacommodityItem { get; set; }

    public DateTime? RhSystemCreateTimeUtc { get; set; }

    public string? RhSystemCreateUser { get; set; }

    public DateTime? RhSystemLastEditTimeUtc { get; set; }

    public string? RhSystemLastEditUser { get; set; }
}
