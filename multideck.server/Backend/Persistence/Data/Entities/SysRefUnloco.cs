using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysRefUnloco
{
    public Guid? RlPk { get; set; }

    public string? RlCode { get; set; }

    public bool? RlIsActive { get; set; }

    public bool? RlIsSystem { get; set; }

    public bool? RlIsUpdatable { get; set; }

    public string? RlPortName { get; set; }

    public string? RlNameWithDiacriticals { get; set; }

    public string? RlIata { get; set; }

    public bool? RlHasAirport { get; set; }

    public bool? RlHasSeaport { get; set; }

    public bool? RlHasRail { get; set; }

    public bool? RlHasRoad { get; set; }

    public bool? RlHasPost { get; set; }

    public bool? RlHasCustomsLodge { get; set; }

    public bool? RlHasUnload { get; set; }

    public bool? RlHasStore { get; set; }

    public bool? RlHasTerminal { get; set; }

    public bool? RlHasDischarge { get; set; }

    public bool? RlHasOutport { get; set; }

    public bool? RlHasBorderCrossing { get; set; }

    public Guid? RlR3 { get; set; }

    public string? RlRnNkcountryCode { get; set; }

    public Guid? RlRw { get; set; }

    public string? RlIataregionCode { get; set; }

    public string? RlGeoLocation { get; set; }

    public DateTime? RlSystemCreateTimeUtc { get; set; }

    public string? RlSystemCreateUser { get; set; }

    public DateTime? RlSystemLastEditTimeUtc { get; set; }

    public string? RlSystemLastEditUser { get; set; }
}
