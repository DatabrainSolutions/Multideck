using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysLoctimeZoneAlias
{
    public string LoctzaAliasCode { get; set; } = null!;

    public string LoctzaTimeZoneCode { get; set; } = null!;

    public string LoctzaName { get; set; } = null!;

    public bool LoctzaIsAmbiguous { get; set; }

    public string? LoctzaNotes { get; set; }

    public bool LoctzaIsActive { get; set; }

    public virtual SysLoctimeZone LoctzaTimeZoneCodeNavigation { get; set; } = null!;
}
