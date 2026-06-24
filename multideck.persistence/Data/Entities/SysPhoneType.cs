using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysPhoneType
{
    public int SysPhoneTypeId { get; set; }

    public string SysPhoneTypeName { get; set; } = null!;

    public int SysPhoneTypeGrouping { get; set; }
}
